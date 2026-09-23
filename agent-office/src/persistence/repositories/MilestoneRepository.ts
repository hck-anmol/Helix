import { db } from "../database";

export interface MilestoneRecord {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: string;
    budget: number;
    verificationAttempts: number;
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

    incrementVerificationAttempts(id: string) {
        const stmt = db.prepare(`UPDATE milestones SET verificationAttempts = verificationAttempts + 1 WHERE id = ?`);
        stmt.run(id);
    }

    get(id: string): MilestoneRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM milestones WHERE id = ?`);
        return stmt.get(id) as MilestoneRecord | undefined;
    }

    getPendingByProject(projectId: string): MilestoneRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM milestones WHERE projectId = ? AND status = 'PENDING' LIMIT 1`);
        return stmt.get(projectId) as MilestoneRecord | undefined;
    }
}
