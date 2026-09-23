import { db } from "../database";
import { Issue, IssueStatus } from "../../projects/Issue";

export class IssueRepository {
    create(issue: Issue) {
        const stmt = db.prepare(`
            INSERT INTO issues (id, projectId, milestoneId, title, description, type, priority, status, assignedRole, fixAttempts)
            VALUES (@id, @projectId, @milestoneId, @title, @description, @type, @priority, @status, @assignedRole, @fixAttempts)
        `);
        stmt.run({ ...issue, assignedRole: issue.assignedRole || null });
    }

    get(id: string): Issue | undefined {
        const stmt = db.prepare(`SELECT * FROM issues WHERE id = ?`);
        return stmt.get(id) as Issue | undefined;
    }

    updateStatus(id: string, status: IssueStatus) {
        const stmt = db.prepare(`UPDATE issues SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(status, id);
    }

    incrementFixAttempts(id: string) {
        const stmt = db.prepare(`UPDATE issues SET fixAttempts = fixAttempts + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(id);
    }

    listByMilestone(milestoneId: string): Issue[] {
        const stmt = db.prepare(`SELECT * FROM issues WHERE milestoneId = ?`);
        return stmt.all(milestoneId) as Issue[];
    }

    listOpenByMilestone(milestoneId: string): Issue[] {
        const stmt = db.prepare(`SELECT * FROM issues WHERE milestoneId = ? AND status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')`);
        return stmt.all(milestoneId) as Issue[];
    }
}
