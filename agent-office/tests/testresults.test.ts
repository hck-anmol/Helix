import { db } from "../src/persistence/database";
import { TestResultRepository, TestResult } from "../src/persistence/repositories/TestResultRepository";
import crypto from "crypto";
import assert from "assert";

export async function run() {
    console.log("Running TestResultRepository Tests...");
    const repo = new TestResultRepository();
    
    // Setup minimal foreign keys
    db.exec(`
        INSERT OR IGNORE INTO projects (id, name, currentPhase) VALUES ('tr-proj-1', 'Test', 'EXECUTION');
        INSERT OR IGNORE INTO milestones (id, projectId, title, status) VALUES ('tr-ms-1', 'tr-proj-1', 'Test MS', 'EXECUTION');
        INSERT OR IGNORE INTO issues (id, projectId, milestoneId, title, status) VALUES ('tr-issue-1', 'tr-proj-1', 'tr-ms-1', 'Task 1', 'RESOLVED');
        INSERT OR IGNORE INTO agent_runs (id, projectId) VALUES ('tr-run-1', 'tr-proj-1');
    `);

    const id = crypto.randomUUID();
    const tr: TestResult = {
        id,
        projectId: 'tr-proj-1',
        milestoneId: 'tr-ms-1',
        issueId: 'tr-issue-1',
        workerRunId: 'tr-run-1',
        command: 'npm test',
        status: 'PASSED',
        exitCode: 0,
        stdout: 'PASS',
        stderr: '',
        durationMs: 150
    };

    repo.create(tr);

    const retrieved = repo.get(id);
    assert(retrieved !== undefined, "TestResult should be retrieved");
    assert(retrieved.command === 'npm test');
    assert(retrieved.status === 'PASSED');
    assert(retrieved.exitCode === 0);
    assert(retrieved.durationMs === 150);

    const byMs = repo.listByMilestone('tr-ms-1');
    assert(byMs.length > 0, "Should list by milestone");

    const byIssue = repo.listByIssue('tr-issue-1');
    assert(byIssue.length > 0, "Should list by issue");

    console.log("TestResultRepository tests passed!");
}
