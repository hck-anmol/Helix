export interface TestResult { id: string; projectId: string; milestoneId: string; issueId: string; workerRunId: string; command: string; status: string; exitCode: number; stdout: string; stderr: string; durationMs: number; createdAt?: string; }
import { db } from "../database";

export class TestResultRepository {
    create(result: TestResult) {
        const stmt = db.prepare(`
            INSERT INTO test_runs (id, projectId, milestoneId, issueId, workerRunId, command, status, exitCode, stdout, stderr, durationMs)
            VALUES (@id, @projectId, @milestoneId, @issueId, @workerRunId, @command, @status, @exitCode, @stdout, @stderr, @durationMs)
        `);
        stmt.run(result);
    }

    get(id: string): TestResult | undefined {
        const stmt = db.prepare(`SELECT * FROM test_runs WHERE id = ?`);
        return stmt.get(id) as TestResult | undefined;
    }

    listByMilestone(milestoneId: string): TestResult[] {
        const stmt = db.prepare(`SELECT * FROM test_runs WHERE milestoneId = ? ORDER BY createdAt ASC`);
        return stmt.all(milestoneId) as TestResult[];
    }

    listByIssue(issueId: string): TestResult[] {
        const stmt = db.prepare(`SELECT * FROM test_runs WHERE issueId = ? ORDER BY createdAt ASC`);
        return stmt.all(issueId) as TestResult[];
    }
}
