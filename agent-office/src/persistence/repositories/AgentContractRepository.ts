import { db } from "../database";
import { AgentContract, AgentContractSchema } from "../../contracts/AgentContract";

export class AgentContractRepository {
    create(contract: AgentContract) {
        AgentContractSchema.parse(contract);
        
        const stmt = db.prepare(`
            INSERT INTO agent_contracts (
                id, projectId, milestoneId, issueId, sender, receiver, contractType, 
                objective, inputs, acceptanceCriteria, constraints, contextHash, status, createdAt
            ) VALUES (
                @id, @projectId, @milestoneId, @issueId, @sender, @receiver, @contractType, 
                @objective, @inputs, @acceptanceCriteria, @constraints, @contextHash, @status, @createdAt
            )
        `);
        
        const _obj = {
            ...contract,
            inputs: JSON.stringify(contract.inputs || {}),
            acceptanceCriteria: JSON.stringify(contract.acceptanceCriteria || []),
            constraints: JSON.stringify(contract.constraints || []),
            issueId: contract.issueId || null,
            contextHash: contract.contextHash || null
        };
        stmt.run(_obj);
    }

    get(id: string): AgentContract | undefined {
        const stmt = db.prepare(`SELECT * FROM agent_contracts WHERE id = ?`);
        const row = stmt.get(id) as any;
        if (!row) return undefined;
        return this.mapRow(row);
    }

    getByIssue(issueId: string): AgentContract[] {
        const stmt = db.prepare(`SELECT * FROM agent_contracts WHERE issueId = ? ORDER BY createdAt ASC`);
        return (stmt.all(issueId) as any[]).map(r => this.mapRow(r));
    }

    listByMilestone(milestoneId: string): AgentContract[] {
        const stmt = db.prepare(`SELECT * FROM agent_contracts WHERE milestoneId = ? ORDER BY createdAt ASC`);
        return (stmt.all(milestoneId) as any[]).map(r => this.mapRow(r));
    }

    updateStatus(id: string, status: AgentContract["status"]) {
        const stmt = db.prepare(`UPDATE agent_contracts SET status = ? WHERE id = ?`);
        stmt.run(status, id);
    }

    updateContextHash(id: string, hash: string) {
        const stmt = db.prepare(`UPDATE agent_contracts SET contextHash = ? WHERE id = ?`);
        stmt.run(hash, id);
    }

    complete(id: string, resultStatus: string, resultSummary: string, resultPayload: any) {
        const stmt = db.prepare(`
            UPDATE agent_contracts 
            SET status = 'COMPLETED', resultStatus = ?, resultSummary = ?, resultPayload = ?, completedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        stmt.run(resultStatus, resultSummary, JSON.stringify(resultPayload), id);
    }

    reject(id: string, reason: string) {
        const stmt = db.prepare(`
            UPDATE agent_contracts 
            SET status = 'FAILED', resultStatus = 'FAIL', resultSummary = ?, completedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        stmt.run(reason, id);
    }

    private mapRow(row: any): AgentContract {
        return AgentContractSchema.parse({
            ...row,
            inputs: JSON.parse(row.inputs || "{}"),
            acceptanceCriteria: JSON.parse(row.acceptanceCriteria || "[]"),
            constraints: JSON.parse(row.constraints || "[]"),
            resultPayload: row.resultPayload ? JSON.parse(row.resultPayload) : undefined
        });
    }
}
