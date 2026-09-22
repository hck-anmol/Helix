import { db } from "../database";

export interface AgentRunRecord {
    id: string;
    projectId: string;
    agentId: string;
    role: string;
    model: string;
    phase: string;
    status: string;
    output: string;
}

export class AgentRunRepository {
    create(run: AgentRunRecord) {
        const stmt = db.prepare(`
            INSERT INTO agent_runs (id, projectId, agentId, role, model, phase, status, output)
            VALUES (@id, @projectId, @agentId, @role, @model, @phase, @status, @output)
        `);
        stmt.run(run);
    }
}
