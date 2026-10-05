import { db } from "../database";

export interface CheckpointRecord {
    id: string;
    projectId: string;
    milestoneId: string;
    issueId?: string;
    workerId?: string;
    phase: string;
    checkpointType: string;
    state?: any;
    metadata?: any;
    createdAt?: string;
}

export class CheckpointRepository {
    create(checkpoint: CheckpointRecord) {
        const stmt = db.prepare(`
            INSERT INTO checkpoints (id, projectId, milestoneId, issueId, workerId, phase, checkpointType, state, metadata)
            VALUES (@id, @projectId, @milestoneId, @issueId, @workerId, @phase, @checkpointType, @state, @metadata)
        `);
        stmt.run({
            ...checkpoint,
            issueId: checkpoint.issueId || null,
            workerId: checkpoint.workerId || null,
            state: checkpoint.state ? JSON.stringify(checkpoint.state) : null,
            metadata: checkpoint.metadata ? JSON.stringify(checkpoint.metadata) : null
        });
    }

    listByProject(projectId: string): CheckpointRecord[] {
        const stmt = db.prepare(`SELECT * FROM checkpoints WHERE projectId = ? ORDER BY createdAt ASC`);
        const rows = stmt.all(projectId) as any[];
        return rows.map(r => ({
            ...r,
            state: r.state ? JSON.parse(r.state) : null,
            metadata: r.metadata ? JSON.parse(r.metadata) : null
        }));
    }

    getLatestByProject(projectId: string): CheckpointRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM checkpoints WHERE projectId = ? ORDER BY createdAt DESC LIMIT 1`);
        const row = stmt.get(projectId) as any;
        if (!row) return undefined;
        return {
            ...row,
            state: row.state ? JSON.parse(row.state) : null,
            metadata: row.metadata ? JSON.parse(row.metadata) : null
        };
    }
}
