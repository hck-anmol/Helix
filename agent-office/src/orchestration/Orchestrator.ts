import { ParallelExecutor } from "./ParallelExecutor";
import { StateMachine } from "./StateMachine";
import { Athena } from "../agents/managers/athena/Athena";
import { Ares } from "../agents/managers/ares/Ares";
import { Apollo } from "../agents/managers/apollo/Apollo";
import { Reviewer } from "../agents/managers/reviewer/Reviewer";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "../persistence/repositories/ArtifactChangeRepository";
import { CodeReviewRepository } from "../persistence/repositories/CodeReviewRepository";
import { Scheduler } from "./Scheduler";
import { ArtifactSnapshot } from "../utils/ArtifactSnapshot";
import { AgentContext } from "../agents/base/AgentContext";
import { config } from "../config/config";
import crypto from "crypto";
import { ContextBuilder } from "../context/ContextBuilder";
import { ContextSerializer } from "../context/ContextSerializer";
import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { AgentContractRepository } from "../persistence/repositories/AgentContractRepository";

const MAX_VERIFICATION_ATTEMPTS = 3;
const MAX_FIX_ATTEMPTS_PER_ISSUE = 2;

export class Orchestrator {
    private contextBuilder: ContextBuilder;
    private runRepo = new AgentRunRepository();
    private contractRepo = new AgentContractRepository();

    constructor(
        private athena: Athena,
        private ares: Ares,
        private apollo: Apollo,
        private reviewer: Reviewer,
        private workerFactory: WorkerFactory,
        private projectRepo: ProjectRepository,
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private verificationRepo: VerificationRepository,
        private testResultRepo: TestResultRepository,
        private artifactChangeRepo: ArtifactChangeRepository,
        private codeReviewRepo: CodeReviewRepository,
        private checkpointRepo?: any,
        private runRepoParam?: any
    ) {
        if (!this.checkpointRepo) {
            const { CheckpointRepository } = require("../persistence/repositories/CheckpointRepository");
            this.checkpointRepo = new CheckpointRepository();
        }

        this.contextBuilder = new ContextBuilder(
            projectRepo, milestoneRepo, issueRepo, this.runRepo,
            codeReviewRepo, artifactChangeRepo, testResultRepo, verificationRepo
        );
    }

    private _injectContext(context: AgentContext, limits?: any) {
        const executionContext = this.contextBuilder.build(
            context.projectId,
            context.currentMilestoneId,
            context.currentIssueId,
            limits
        );
        const serialized = ContextSerializer.serialize(executionContext);
        context.historicalContext = serialized;
        context.contextHash = ContextSerializer.hash(serialized);
    }
    
    private hasUnresolvedExecutionFailures(milestoneId: string): boolean {
        const allIssues = this.issueRepo.listByMilestone(milestoneId);
        return allIssues.some(i => i.status === "FAILED");
    }


    async resumeProject(projectId: string): Promise<void> {
        console.log("[ORCHESTRATOR] Resuming project " + projectId);
        
        const project = this.projectRepo.get(projectId);
        if (!project) throw new Error("Project not found");

        const existingMilestone = this.milestoneRepo.getLatestByProject(projectId);
        if (!existingMilestone) {
            return this.runProject(projectId);
        }

        if (existingMilestone.status === "COMPLETED") {
            console.log("[ORCHESTRATOR] Project is already COMPLETED. Idempotent resume.");
            return;
        }

        // Fix stale issues
        const issues = this.issueRepo.listByMilestone(existingMilestone.id);
        for (const issue of issues) {
            if (issue.status === "RUNNING" || issue.status === "CLAIMED") {
                console.log(`[ORCHESTRATOR] Marking stale issue ${issue.id} as PENDING`);
                this.issueRepo.updateStatus(issue.id, "PENDING");
            }
        }
        
        // Also fix stale contracts
        const db = require("../persistence/database").db;
        db.prepare(`UPDATE agent_contracts SET status = 'FAILED' WHERE milestoneId = ? AND status IN ('RUNNING', 'READY', 'CREATED')`).run(existingMilestone.id);

        return this._runExecutionLoop(projectId, existingMilestone.id);
    }

    async runProject(projectId: string): Promise<void> {
        const project = this.projectRepo.get(projectId);
        if (!project) throw new Error("Project not found");

        const existingMilestone = this.milestoneRepo.getLatestByProject(projectId);
        if (existingMilestone && existingMilestone.status !== 'FAILED' && existingMilestone.status !== 'COMPLETED') {
            console.log("[ORCHESTRATOR] Milestone exists. Calling resumeProject instead.");
            return this.resumeProject(projectId);
        }

        const context: AgentContext = {
            projectId,
            workspaceRoot: require("path").join(config.workspaceRoot, projectId),
            projectSpec: project.specification
        };

        console.log(`[ORCHESTRATOR] Starting project: ${project.name}`);
        const state = new StateMachine("PLANNED");
        const scheduler = new Scheduler(this.issueRepo);

        try {
            console.log(`[ORCHESTRATOR] Phase: STRATEGY`);
            console.log(`[ATHENA] Generating milestone...`);
            
            this._injectContext(context);
            const athenaResult = await this.athena.invoke(`Create the next milestone for the project: ${project.specification}`, context);
            if (!athenaResult.success || !athenaResult.data) throw new Error("Athena failed to generate milestone");
            
            const milestoneData = athenaResult.data;
            console.log(`[ATHENA] MILESTONE created: ${milestoneData.title}`);
            
            const milestoneId = crypto.randomUUID();
            this.milestoneRepo.create({
                id: milestoneId,
                projectId,
                title: milestoneData.title,
                description: milestoneData.description,
                status: "PLANNED",
                budget: milestoneData.budget,
                verificationAttempts: 0
            });

            // Create suggested tasks as PENDING issues
            if (milestoneData.suggestedTasks) {
                for (const t of milestoneData.suggestedTasks) {
                    this.issueRepo.create({
                        id: crypto.randomUUID(),
                        projectId,
                        milestoneId,
                        title: t.title,
                        description: t.title,
                        type: t.type,
                        priority: "MEDIUM",
                        status: "PENDING",
                        fixAttempts: 0,
                        attemptCount: 0
                    });
                }
            }

            return this._runExecutionLoop(projectId, milestoneId);
        } catch (error: any) {
            console.error(`[ORCHESTRATOR] Error in phase ${state.phase}:`, error.message);
            state.transition("FAILED");
            if (this.checkpointRepo) {
                this.checkpointRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId: context.currentMilestoneId || "",
                    phase: state.phase, checkpointType: "PROJECT_FAILED",
                    metadata: { error: error.message }
                });
            }
        }
    }

    private async _runExecutionLoop(projectId: string, milestoneId: string) {
        const project = this.projectRepo.get(projectId);
        const milestoneData = this.milestoneRepo.get(milestoneId);
        
        const context: AgentContext = {
            projectId,
            workspaceRoot: require("path").join(config.workspaceRoot, projectId),
            projectSpec: project!.specification,
            currentMilestoneId: milestoneId,
            currentMilestone: milestoneData as any
        };
        const state = new StateMachine(milestoneData!.status as any);

        try {
            if (state.phase === "PLANNED") {
                state.transition("ACTIVE");
                if (this.checkpointRepo) {
                    this.checkpointRepo.create({
                        id: crypto.randomUUID(), projectId, milestoneId,
                        phase: state.phase, checkpointType: "MILESTONE_STARTED"
                    });
                }
            }
            
            const executor = new ParallelExecutor(
                this.projectRepo,
                this.issueRepo,
                this.contractRepo,
                this.runRepo,
                this.artifactChangeRepo,
                this.testResultRepo,
                this.codeReviewRepo,
                this.milestoneRepo,
                this.verificationRepo,
                this.workerFactory,
                this.reviewer,
                this.ares,
                this.checkpointRepo
            );

            let attempts = 0;
            const MAX_VERIFICATION_ATTEMPTS = 3;
            let running = true;
            
            while (running && attempts < MAX_VERIFICATION_ATTEMPTS) {
                attempts++;
                
                if (state.phase !== "EXECUTING") {
                    state.transition("EXECUTING");
                    this.milestoneRepo.updateStatus(milestoneId, "EXECUTING");
                }
                
                await executor.executeMilestone(context);

                const allIssues = this.issueRepo.listByMilestone(milestoneId);
                const unresolved = allIssues.filter(i => ["PENDING", "READY", "BLOCKED", "FAILED"].includes(i.status));
                
                if (unresolved.length > 0) {
                    const failedCount = unresolved.filter(i => i.status === "FAILED").length;
                    if (failedCount > 0) {
                        console.error(`[ORCHESTRATOR] Execution failed: ${failedCount} issues encountered unrecoverable errors.`);
                    } else {
                        console.error(`[ORCHESTRATOR] Deadlock detected: ${unresolved.length} unresolved issues but 0 READY issues.`);
                    }
                    state.transition("FAILED");
                    this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                    running = false;
                    break;
                }

                // All issues resolved. Proceed to verification.
                state.transition("VERIFYING");
                this.milestoneRepo.updateStatus(milestoneId, "VERIFYING");
                console.log(`[ORCHESTRATOR] Phase: VERIFICATION`);
                console.log(`[APOLLO] Verifying milestone...`);
                
                const testRuns = this.testResultRepo.listByMilestone(milestoneId);
                const testsContext = testRuns.map(tr => `[Test] ${tr.command} | Exit: ${tr.exitCode} | Status: ${tr.status}\nSTDOUT: ${tr.stdout}\nSTDERR: ${tr.stderr}`).join("\n\n");
                const apolloContext = `\nIssues:\n${allIssues.map(i => `- ${i.title} (${i.status})`).join("\n")}\n\nTest Evidence:\n${testsContext}`;
                
                // VERIFICATION CONTRACT
                const verificationContractId = crypto.randomUUID();
                const verificationContract = {
                    id: verificationContractId,
                    projectId, milestoneId, issueId: undefined,
                    sender: "orchestrator" as const, receiver: "apollo" as const,
                    contractType: "VERIFICATION" as const,
                    objective: "Verify milestone completion",
                    inputs: { testEvidence: testRuns.length },
                    acceptanceCriteria: [], constraints: [],
                    status: "CREATED" as const, createdAt: new Date().toISOString()
                };
                this.contractRepo.create(verificationContract);
                this.contractRepo.updateStatus(verificationContractId, "RUNNING");
                
                context.currentContractId = verificationContractId;
                this._injectContext(context, { maxVerificationRuns: 2, maxTestResults: 10 });
                if (context.contextHash) this.contractRepo.updateContextHash(verificationContractId, context.contextHash);
                
                if (this.checkpointRepo) {
                    this.checkpointRepo.create({
                        id: crypto.randomUUID(), projectId, milestoneId,
                        phase: "VERIFICATION", checkpointType: "VERIFICATION_STARTED"
                    });
                }
                
                const apolloResult = await this.apollo.invoke(`Verify if the milestone was completed. Milestone: ${JSON.stringify(context.currentMilestone)}${apolloContext}`, context);
                
                if (!apolloResult.success || !apolloResult.data) {
                    this.contractRepo.reject(verificationContractId, "Verification execution failed");
                    throw new Error("Apollo failed to verify");
                }

                const verification = apolloResult.data;
                const milestoneRecord = this.milestoneRepo.getPendingByProject(projectId) || this.milestoneRepo.get(milestoneId)!;
                const attemptNum = (milestoneRecord.verificationAttempts || 0) + 1;

                const verificationRunId = crypto.randomUUID();
                this.verificationRepo.create({
                    id: verificationRunId,
                    milestoneId,
                    attemptNumber: attemptNum,
                    status: verification.status,
                    evidence: JSON.stringify(verification.evidence),
                    failures: JSON.stringify(verification.failures || []),
                    requiredFixes: JSON.stringify(verification.requiredFixes || [])
                });

                this.milestoneRepo.incrementVerificationAttempts(milestoneId);

                if (this.checkpointRepo) {
                    this.checkpointRepo.create({
                        id: crypto.randomUUID(), projectId, milestoneId,
                        phase: "VERIFICATION", checkpointType: "VERIFICATION_COMPLETED",
                        metadata: { status: verification.status }
                    });
                }

                if (verification.status === "PASS") {
                    console.log(`[APOLLO] PASS`);
                    if (this.hasUnresolvedExecutionFailures(milestoneId)) {
                        console.error(`[ORCHESTRATOR] INVARIANT VIOLATION: Apollo passed but there are FAILED issues.`);
                        this.contractRepo.complete(verificationContractId, "FAIL", "Apollo PASSED but issues FAILED", verification);
                        state.transition("FAILED");
                        this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                        running = false;
                    } else {
                        this.contractRepo.complete(verificationContractId, "PASS", "Milestone Verified", verification);
                        state.transition("COMPLETED");
                        this.milestoneRepo.updateStatus(milestoneId, "COMPLETED");
                        
                        allIssues.forEach(issue => this.issueRepo.updateStatus(issue.id, "VERIFIED"));
                        
                        running = false;
                    }
                } else {
                    console.log(`[APOLLO] FAIL. Required fixes: ${verification.requiredFixes?.join(", ")}`);
                    this.contractRepo.complete(verificationContractId, "FAIL", "Verification Failed", verification);
                    context.verificationFeedback = verification;
                    
                    if (attemptNum >= MAX_VERIFICATION_ATTEMPTS) {
                        console.log(`[ORCHESTRATOR] Reached MAX_VERIFICATION_ATTEMPTS (${MAX_VERIFICATION_ATTEMPTS}). Stopping safely.`);
                        state.transition("FAILED");
                        this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                        running = false;
                        break;
                    }

                    if (verification.requiredFixes) {
                        for (const fix of verification.requiredFixes) {
                            const exists = allIssues.some(i => i.title === fix);
                            if (!exists) {
                                console.log(`[ISSUE] Creating FIX issue: ${fix}`);
                                this.issueRepo.create({
                                    id: crypto.randomUUID(),
                                    projectId,
                                    milestoneId,
                                    title: fix,
                                    description: `Required fix identified by Apollo: ${fix}`,
                                    type: "FIX",
                                    priority: "HIGH",
                                    status: "READY",
                                    fixAttempts: 0,
                                    attemptCount: 0,
                                    assignedRole: "developer"
                                });
                            }
                        }
                    }
                }
            }
            
            const reporter = new (require("./Reporter").Reporter)(this.milestoneRepo, this.issueRepo, this.verificationRepo, this.testResultRepo, this.artifactChangeRepo, this.codeReviewRepo);
            reporter.generateMilestoneReport(projectId, milestoneId);
            
            if (this.checkpointRepo && state.phase === "COMPLETED") {
                this.checkpointRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId,
                    phase: state.phase, checkpointType: "PROJECT_COMPLETED"
                });
            } else if (this.checkpointRepo && state.phase === "FAILED") {
                this.checkpointRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId,
                    phase: state.phase, checkpointType: "PROJECT_FAILED"
                });
            }
            
        } catch (error: any) {
            console.error(`[ORCHESTRATOR] Error in phase ${state.phase}:`, error.message);
            state.transition("FAILED");
            if (this.checkpointRepo) {
                this.checkpointRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId: context.currentMilestoneId || "",
                    phase: state.phase, checkpointType: "PROJECT_FAILED",
                    metadata: { error: error.message }
                });
            }
        }
        
        console.log(`[ORCHESTRATOR] Project ended with state: ${state.phase}`);
    }
}
