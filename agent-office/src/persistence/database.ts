import Database from "better-sqlite3";
import { config } from "../config/config";
import fs from "fs";
import path from "path";

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT,
        specification TEXT,
        successCriteria TEXT,
        currentPhase TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        title TEXT,
        description TEXT,
        status TEXT,
        budget INTEGER,
        verificationAttempts INTEGER DEFAULT 0,
        FOREIGN KEY(projectId) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        title TEXT,
        description TEXT,
        type TEXT,
        priority TEXT,
        status TEXT,
        assignedRole TEXT,
        fixAttempts INTEGER DEFAULT 0,
        attemptCount INTEGER DEFAULT 0,
        sourceVerificationId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projectId) REFERENCES projects(id),
        FOREIGN KEY(milestoneId) REFERENCES milestones(id)
    );

    CREATE TABLE IF NOT EXISTS issue_dependencies (
        issueId TEXT,
        dependsOnId TEXT,
        PRIMARY KEY (issueId, dependsOnId),
        FOREIGN KEY(issueId) REFERENCES issues(id),
        FOREIGN KEY(dependsOnId) REFERENCES issues(id)
    );

    CREATE TABLE IF NOT EXISTS verification_runs (
        id TEXT PRIMARY KEY,
        milestoneId TEXT,
        attemptNumber INTEGER,
        status TEXT,
        evidence TEXT,
        failures TEXT,
        requiredFixes TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(milestoneId) REFERENCES milestones(id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        issueId TEXT,
        agentId TEXT,
        role TEXT,
        model TEXT,
        task TEXT,
        phase TEXT,
        status TEXT,
        output TEXT,
        startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        completedAt DATETIME,
        error TEXT
    );

    CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        issueId TEXT,
        workerRunId TEXT,
        command TEXT,
        status TEXT,
        exitCode INTEGER,
        stdout TEXT,
        stderr TEXT,
        durationMs INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projectId) REFERENCES projects(id),
        FOREIGN KEY(milestoneId) REFERENCES milestones(id),
        FOREIGN KEY(issueId) REFERENCES issues(id),
        FOREIGN KEY(workerRunId) REFERENCES agent_runs(id)
    );

    CREATE TABLE IF NOT EXISTS artifact_changes (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        issueId TEXT,
        agentRunId TEXT,
        path TEXT,
        changeType TEXT,
        beforeHash TEXT,
        afterHash TEXT,
        beforeSize INTEGER,
        afterSize INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projectId) REFERENCES projects(id),
        FOREIGN KEY(milestoneId) REFERENCES milestones(id),
        FOREIGN KEY(issueId) REFERENCES issues(id),
        FOREIGN KEY(agentRunId) REFERENCES agent_runs(id)
    );

    CREATE TABLE IF NOT EXISTS code_reviews (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        issueId TEXT,
        agentRunId TEXT,
        status TEXT,
        summary TEXT,
        findings TEXT,
        filesReviewed TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projectId) REFERENCES projects(id),
        FOREIGN KEY(milestoneId) REFERENCES milestones(id),
        FOREIGN KEY(issueId) REFERENCES issues(id),
        FOREIGN KEY(agentRunId) REFERENCES agent_runs(id)
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        milestoneId TEXT,
        issueId TEXT,
        workerId TEXT,
        phase TEXT,
        checkpointType TEXT,
        state TEXT,
        metadata TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Auto-migrate to add sourceVerificationId if it doesn't exist
try {
    db.exec(`ALTER TABLE issues ADD COLUMN sourceVerificationId TEXT`);
} catch (e) {
    // Ignore if column already exists
}
