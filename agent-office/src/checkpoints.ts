import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";

const projectId = process.argv[2];
if (!projectId) {
    console.error("Usage: npm run checkpoints -- <project-id>");
    process.exit(1);
}

const repo = new CheckpointRepository();
const checkpoints = repo.listByProject(projectId);

if (checkpoints.length === 0) {
    console.log(`No checkpoints found for project ${projectId}.`);
    process.exit(0);
}

console.log(`\nCheckpoint History for Project: ${projectId}\n`);
for (const cp of checkpoints) {
    const time = cp.createdAt ? new Date(cp.createdAt).toISOString() : "Unknown Time";
    let detail = "";
    if (cp.checkpointType === "WORKER_STARTED" && cp.workerId) detail = `(Worker: ${cp.workerId})`;
    if (cp.checkpointType === "ISSUE_STARTED" && cp.issueId) detail = `(Issue: ${cp.issueId})`;
    if (cp.checkpointType === "WORKER_INTERRUPTED") detail = `(Recovered stale run)`;
    
    console.log(`[${time}] [${cp.phase}] ${cp.checkpointType} ${detail}`);
}
console.log("");
