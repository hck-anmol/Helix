import { db } from "../database";

export interface AgentRunRecord {
    id: string;
    projectId: string;
    milestoneId: string;
    issueId: string;
    contractId?: string;
    agentId: string;
    role: string;
    model: string;
    task: string;
    phase: string;
    status: string;
    output: string;
    contextHash?: string;
    duration?: number;
    startedAt?: string;
    completedAt?: string;
    error?: string;
}

export class AgentRunRepository {
    create(run: AgentRunRecord) {
        const stmt = db.prepare(`
            INSERT INTO agent_runs (id, projectId, milestoneId, issueId, contractId, agentId, role, model, task, phase, status, output, contextHash, duration, completedAt, error)
            VALUES (@id, @projectId, @milestoneId, @issueId, @contractId, @agentId, @role, @model, @task, @phase, @status, @output, @contextHash, @duration, CURRENT_TIMESTAMP, @error)
        `);
        stmt.run({ ...run, error: run.error || null, task: run.task || "", contextHash: run.contextHash || null, duration: run.duration || null, contractId: run.contractId || null });
    }

    get(id: string): AgentRunRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM agent_runs WHERE id = ?`);
        return stmt.get(id) as AgentRunRecord | undefined;
    }

    updateOutput(runId: string, output: string) {
        const stmt = db.prepare(`UPDATE agent_runs SET output = ? WHERE id = ?`);
        stmt.run(output, runId);
    }

    getByIssueId(issueId: string): AgentRunRecord[] {
        const stmt = db.prepare(`SELECT * FROM agent_runs WHERE issueId = ? ORDER BY startedAt ASC`);
        return stmt.all(issueId) as AgentRunRecord[];
    }

    listByMilestone(milestoneId: string): AgentRunRecord[] {
        const stmt = db.prepare(`SELECT * FROM agent_runs WHERE milestoneId = ? ORDER BY startedAt ASC`);
        return stmt.all(milestoneId) as AgentRunRecord[];
    }
}
