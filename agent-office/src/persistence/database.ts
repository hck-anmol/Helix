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
        FOREIGN KEY(projectId) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        agentId TEXT,
        role TEXT,
        model TEXT,
        phase TEXT,
        status TEXT,
        output TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(projectId) REFERENCES projects(id)
    );
`);
