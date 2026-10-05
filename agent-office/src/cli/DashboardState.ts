/**
 * DashboardState — snapshot of everything the Dashboard needs to render.
 *
 * All values come from real repository reads; nothing is fabricated.
 */

export interface AgentRow {
    role: string;
    status: string;      // SUCCESS | FAILED | RUNNING (derived from agent_runs)
    model: string;
    durationMs?: number;
    runCount: number;
}

export interface IssueRow {
    id: string;
    title: string;
    status: string;
    type: string;
    priority: string;
    fixAttempts: number;
}

export interface EventRow {
    timestamp: string;
    eventType: string;
    role?: string;
    message?: string;
    durationMs?: number;
    status?: string;
}

export interface WorkerSummary {
    total: number;
    active: number;
    completed: number;
    failed: number;
}

export interface DashboardState {
    projectId: string;
    projectName: string;
    milestoneTitle: string;
    phase: string;        // PLANNED | ACTIVE | EXECUTING | VERIFYING | COMPLETED | FAILED

    startedAt: number;   // Date.now() at project start

    issues: IssueRow[];
    agents: AgentRow[];
    recentEvents: EventRow[];
    workers: WorkerSummary;

    testsPassed: number;
    testsFailed: number;
    testsTotal: number;

    reviewStatus: string; // PASS | FAIL | RUNNING | -
    apolloStatus: string; // PASS | FAIL | RUNNING | -

    artifactPaths: string[];  // list of produced file paths

    ollamaConnected: boolean;
    dbConnected: boolean;

    elapsedMs: number;

    finalPhase?: "COMPLETED" | "FAILED";
}

export function initialState(projectId: string, projectName: string): DashboardState {
    return {
        projectId,
        projectName,
        milestoneTitle: "—",
        phase: "PLANNED",
        startedAt: Date.now(),
        issues: [],
        agents: [],
        recentEvents: [],
        workers: { total: 0, active: 0, completed: 0, failed: 0 },
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
        reviewStatus: "-",
        apolloStatus: "-",
        artifactPaths: [],
        ollamaConnected: true,
        dbConnected: true,
        elapsedMs: 0,
    };
}

/** Compute overall progress percentage from real issue states. */
export function computeProgress(issues: IssueRow[]): number {
    if (issues.length === 0) return 0;
    const done = issues.filter(i =>
        ["RESOLVED", "VERIFIED", "COMPLETED"].includes(i.status)
    ).length;
    return Math.round((done / issues.length) * 100);
}
