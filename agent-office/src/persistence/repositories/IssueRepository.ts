import { db } from "../database";
import { Issue, IssueStatus } from "../../projects/Issue";

export class IssueRepository {
    create(issue: Issue) {
        const stmt = db.prepare(`
            INSERT INTO issues (id, projectId, milestoneId, title, description, type, priority, status, assignedRole, fixAttempts, attemptCount)
            VALUES (@id, @projectId, @milestoneId, @title, @description, @type, @priority, @status, @assignedRole, @fixAttempts, @attemptCount)
        `);
        stmt.run({ ...issue, assignedRole: issue.assignedRole || null, attemptCount: issue.attemptCount || 0 });
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

    incrementAttemptCount(id: string) {
        const stmt = db.prepare(`UPDATE issues SET attemptCount = attemptCount + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(id);
    }

    listByMilestone(milestoneId: string): Issue[] {
        const stmt = db.prepare(`SELECT * FROM issues WHERE milestoneId = ?`);
        return stmt.all(milestoneId) as Issue[];
    }

    listOpenByMilestone(milestoneId: string): Issue[] {
        const stmt = db.prepare(`SELECT * FROM issues WHERE milestoneId = ? AND status IN ('OPEN', 'IN_PROGRESS', 'PENDING', 'READY', 'RUNNING', 'FAILED', 'BLOCKED')`);
        return stmt.all(milestoneId) as Issue[];
    }

    getDependencies(issueId: string): string[] {
        const stmt = db.prepare(`SELECT dependsOnId FROM issue_dependencies WHERE issueId = ?`);
        const rows = stmt.all(issueId) as { dependsOnId: string }[];
        return rows.map(r => r.dependsOnId);
    }

    getDependents(issueId: string): string[] {
        const stmt = db.prepare(`SELECT issueId FROM issue_dependencies WHERE dependsOnId = ?`);
        const rows = stmt.all(issueId) as { issueId: string }[];
        return rows.map(r => r.issueId);
    }

    checkCycle(issueId: string, dependsOnId: string): boolean {
        // We are trying to add: issueId -> dependsOnId
        // This means issueId depends on dependsOnId completing first.
        // A cycle occurs if dependsOnId already depends (transitively) on issueId.
        const visited = new Set<string>();
        const queue = [dependsOnId];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === issueId) return true; // Cycle detected
            if (!visited.has(current)) {
                visited.add(current);
                const deps = this.getDependencies(current);
                queue.push(...deps);
            }
        }
        return false;
    }

    addDependency(issueId: string, dependsOnId: string) {
        if (this.checkCycle(issueId, dependsOnId)) {
            throw new Error(`Cannot add dependency ${issueId} -> ${dependsOnId} as it creates a cycle.`);
        }
        const stmt = db.prepare(`INSERT OR IGNORE INTO issue_dependencies (issueId, dependsOnId) VALUES (?, ?)`);
        stmt.run(issueId, dependsOnId);
    }

    evaluateIssueStates(milestoneId: string) {
        const issues = this.listByMilestone(milestoneId);
        
        for (const issue of issues) {
            if (issue.status === 'RESOLVED' || issue.status === 'VERIFIED') continue;
            
            const deps = this.getDependencies(issue.id);
            let isBlocked = false;
            
            for (const depId of deps) {
                const dep = this.get(depId);
                if (!dep || (dep.status !== 'RESOLVED' && dep.status !== 'VERIFIED')) {
                    isBlocked = true;
                    break;
                }
            }

            if (isBlocked && issue.status !== 'BLOCKED') {
                this.updateStatus(issue.id, 'BLOCKED');
            } else if (!isBlocked && (issue.status === 'BLOCKED' || issue.status === 'PENDING')) {
                this.updateStatus(issue.id, 'READY');
            }
        }
    }
}
