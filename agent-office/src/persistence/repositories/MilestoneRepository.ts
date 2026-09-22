import { db } from "../database";

export interface MilestoneRecord {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: string;
    budget: number;
}

export class MilestoneRepository {
    create(milestone: MilestoneRecord) {
        const stmt = db.prepare(`
            INSERT INTO milestones (id, projectId, title, description, status, budget)
            VALUES (@id, @projectId, @title, @description, @status, @budget)
        `);
        stmt.run(milestone);
    }

    updateStatus(id: string, status: string) {
        const stmt = db.prepare(`UPDATE milestones SET status = ? WHERE id = ?`);
        stmt.run(status, id);
    }

    getPendingByProject(projectId: string): MilestoneRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM milestones WHERE projectId = ? AND status = 'PENDING' LIMIT 1`);
        return stmt.get(projectId) as MilestoneRecord | undefined;
    }
}
