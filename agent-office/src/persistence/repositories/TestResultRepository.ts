import { db } from "../database";
import { TestResult } from "../../projects/TestResult";

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
