import { db } from "../database";

export interface AgentRunRecord {
    id: string;
    projectId: string;
    milestoneId: string;
    issueId: string;
    agentId: string;
    role: string;
    model: string;
    task: string;
    phase: string;
    status: string;
    output: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
}

export class AgentRunRepository {
    create(run: AgentRunRecord) {
        const stmt = db.prepare(`
            INSERT INTO agent_runs (id, projectId, milestoneId, issueId, agentId, role, model, task, phase, status, output, completedAt, error)
            VALUES (@id, @projectId, @milestoneId, @issueId, @agentId, @role, @model, @task, @phase, @status, @output, CURRENT_TIMESTAMP, @error)
        `);
        stmt.run({ ...run, error: run.error || null, task: run.task || "" });
    }
}
