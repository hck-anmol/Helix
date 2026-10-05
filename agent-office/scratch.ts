import Database from 'better-sqlite3';
const db = new Database('data/agent-office.db');
const run = db.prepare(`SELECT output, error FROM agent_runs WHERE role='developer' AND status='FAILED' ORDER BY startedAt DESC LIMIT 1`).get() as any;

if (run) {
    console.log("=== OUTPUT ===");
    console.log(run.output);
    console.log("=== ERROR ===");
    console.log(run.error);
} else {
    console.log("No failed developer run found.");
}
