import { db } from "../persistence/database";
import { ExecutionEvent } from "./ExecutionEvent";

export class ExecutionEventRepository {
    create(event: ExecutionEvent): void {
        const stmt = db.prepare(`
            INSERT INTO execution_events (
                id, projectId, milestoneId, issueId, contractId, agentRunId,
                timestamp, eventType, role, model, durationMs, status, message, metadata
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        `);
        stmt.run(
            event.id,
            event.projectId,
            event.milestoneId || null,
            event.issueId || null,
            event.contractId || null,
            event.agentRunId || null,
            event.timestamp,
            event.eventType,
            event.role || null,
            event.model || null,
            event.durationMs !== undefined ? event.durationMs : null,
            event.status || null,
            event.message || null,
            event.metadata ? JSON.stringify(event.metadata) : null
        );
    }

    listByProject(projectId: string): ExecutionEvent[] {
        const stmt = db.prepare(`SELECT * FROM execution_events WHERE projectId = ? ORDER BY timestamp ASC`);
        const rows = stmt.all(projectId) as any[];
        return rows.map(this.mapRowToEvent);
    }

    listByMilestone(milestoneId: string): ExecutionEvent[] {
        const stmt = db.prepare(`SELECT * FROM execution_events WHERE milestoneId = ? ORDER BY timestamp ASC`);
        const rows = stmt.all(milestoneId) as any[];
        return rows.map(this.mapRowToEvent);
    }

    listByIssue(issueId: string): ExecutionEvent[] {
        const stmt = db.prepare(`SELECT * FROM execution_events WHERE issueId = ? ORDER BY timestamp ASC`);
        const rows = stmt.all(issueId) as any[];
        return rows.map(this.mapRowToEvent);
    }

    listByContract(contractId: string): ExecutionEvent[] {
        const stmt = db.prepare(`SELECT * FROM execution_events WHERE contractId = ? ORDER BY timestamp ASC`);
        const rows = stmt.all(contractId) as any[];
        return rows.map(this.mapRowToEvent);
    }

    private mapRowToEvent(row: any): ExecutionEvent {
        return {
            id: row.id,
            projectId: row.projectId,
            milestoneId: row.milestoneId,
            issueId: row.issueId,
            contractId: row.contractId,
            agentRunId: row.agentRunId,
            timestamp: row.timestamp,
            eventType: row.eventType,
            role: row.role,
            model: row.model,
            durationMs: row.durationMs,
            status: row.status,
            message: row.message,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }
}
