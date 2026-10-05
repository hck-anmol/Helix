/**
 * EventStream — polls the existing SQLite repositories on a fixed interval and
 * builds a fresh DashboardState snapshot.
 *
 * It never fabricates data; every field comes directly from existing repos.
 * Poll interval defaults to 500 ms to avoid hammering SQLite.
 */

import { EventEmitter as NodeEmitter } from "events";
import path from "path";
import {
    DashboardState, AgentRow, IssueRow, EventRow,
    WorkerSummary, initialState, computeProgress
} from "./DashboardState";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { ArtifactChangeRepository } from "../persistence/repositories/ArtifactChangeRepository";
import { ExecutionEventRepository } from "../observability/ExecutionEventRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";
import { config } from "../config/config";

export class EventStream extends NodeEmitter {
    private timer: ReturnType<typeof setInterval> | null = null;
    private state: DashboardState;
    private readonly POLL_MS = 500;
    private readonly MAX_RECENT = 12;

    // Repos — all existing
    private issueRepo     = new IssueRepository();
    private runRepo       = new AgentRunRepository();
    private milestoneRepo = new MilestoneRepository();
    private artifactRepo  = new ArtifactChangeRepository();
    private eventRepo     = new ExecutionEventRepository();
    private testRepo      = new TestResultRepository();

    constructor(projectId: string, projectName: string) {
        super();
        this.state = initialState(projectId, projectName);
    }

    start(): void {
        this.poll(); // immediate first read
        this.timer = setInterval(() => this.poll(), this.POLL_MS);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getState(): DashboardState {
        return { ...this.state };
    }

    private poll(): void {
        try {
            this.state.elapsedMs = Date.now() - this.state.startedAt;
            this.refreshFromDB();
            this.emit("update", this.state);
        } catch {
            // Never crash orchestration due to UI poll
        }
    }

    private refreshFromDB(): void {
        const { projectId } = this.state;

        // ── Milestone ─────────────────────────────────────────────────────────
        const milestone = this.milestoneRepo.getLatestByProject(projectId);
        if (milestone) {
            this.state.milestoneTitle = milestone.title;
            this.state.phase          = milestone.status;
        }

        // ── Issues ────────────────────────────────────────────────────────────
        if (milestone) {
            const rawIssues = this.issueRepo.listByMilestone(milestone.id);
            this.state.issues = rawIssues.map(i => ({
                id:          i.id,
                title:       i.title,
                status:      i.status,
                type:        i.type,
                priority:    i.priority,
                fixAttempts: i.fixAttempts || 0,
            }));
        }

        // ── Agent runs ────────────────────────────────────────────────────────
        if (milestone) {
            const rawRuns = this.runRepo.listByMilestone(milestone.id);

            // Aggregate by role — keep the most recent run per role for display
            const byRole = new Map<string, AgentRow>();
            for (const run of rawRuns) {
                const existing = byRole.get(run.role);
                if (!existing || run.startedAt! > (existing as any)._startedAt) {
                    byRole.set(run.role, {
                        role:       run.role,
                        status:     run.status,
                        model:      run.model,
                        durationMs: run.duration,
                        runCount:   1,
                        // private field for sorting:
                        _startedAt: run.startedAt,
                    } as any);
                } else {
                    existing.runCount++;
                }
            }
            this.state.agents = Array.from(byRole.values());

            // Worker summary (developer + tester runs)
            const workerRuns = rawRuns.filter(r => ["developer", "tester"].includes(r.role));
            const wSummary: WorkerSummary = {
                total:     workerRuns.length,
                active:    workerRuns.filter(r => r.status === "RUNNING").length,
                completed: workerRuns.filter(r => r.status === "SUCCESS").length,
                failed:    workerRuns.filter(r => r.status === "FAILED").length,
            };
            this.state.workers = wSummary;

            // Review status from last reviewer run
            const reviewRuns = rawRuns.filter(r => r.role === "reviewer");
            if (reviewRuns.length > 0) {
                const last = reviewRuns[reviewRuns.length - 1];
                this.state.reviewStatus = last.status === "SUCCESS" ? "PASS"
                    : last.status === "FAILED" ? "FAIL" : "RUNNING";
            }

            // Apollo status from last apollo run
            const apolloRuns = rawRuns.filter(r => r.role === "apollo");
            if (apolloRuns.length > 0) {
                const last = apolloRuns[apolloRuns.length - 1];
                this.state.apolloStatus = last.status === "SUCCESS" ? "PASS"
                    : last.status === "FAILED" ? "FAIL" : "RUNNING";
            }

            // Tests
            const testRuns = this.testRepo.listByMilestone(milestone.id);
            this.state.testsTotal  = testRuns.length;
            this.state.testsPassed = testRuns.filter(t => t.status === "PASSED").length;
            this.state.testsFailed = testRuns.filter(t => t.status === "FAILED" || t.status === "ERROR").length;

            // Artifacts — list workspace-relative paths
            const artifacts = this.artifactRepo.listByMilestone(milestone.id);
            this.state.artifactPaths = [
                ...new Set(
                    artifacts
                        .filter(a => a.changeType !== "DELETED")
                        .map(a => path.join(config.workspaceRoot, projectId, a.path))
                )
            ];
        }

        // ── Recent events ─────────────────────────────────────────────────────
        const rawEvents = this.eventRepo.listByProject(projectId);
        this.state.recentEvents = rawEvents
            .slice(-this.MAX_RECENT)
            .map(e => ({
                timestamp:  e.timestamp,
                eventType:  e.eventType,
                role:       e.role,
                message:    e.message,
                durationMs: e.durationMs,
                status:     e.status,
            } as EventRow));

        // ── Terminal state detection ──────────────────────────────────────────
        const terminalPhases = ["COMPLETED", "FAILED"];
        if (terminalPhases.includes(this.state.phase)) {
            this.state.finalPhase = this.state.phase as any;
        }

        // Detect PROJECT_COMPLETED / PROJECT_FAILED events as final state
        const terminalEvents = rawEvents.filter(e =>
            e.eventType === "PROJECT_COMPLETED" || e.eventType === "PROJECT_FAILED"
        );
        if (terminalEvents.length > 0) {
            const last = terminalEvents[terminalEvents.length - 1];
            this.state.finalPhase = last.eventType === "PROJECT_COMPLETED" ? "COMPLETED" : "FAILED";
            this.state.phase      = this.state.finalPhase;
        }
    }
}
