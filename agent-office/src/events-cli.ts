import { ExecutionEventRepository } from "./observability/ExecutionEventRepository";

const projectId = process.argv[2];

if (!projectId) {
    console.error("Usage: ts-node src/events-cli.ts <projectId>");
    process.exit(1);
}

const repo = new ExecutionEventRepository();
const events = repo.listByProject(projectId);

if (events.length === 0) {
    console.log(`No events found for project: ${projectId}`);
    process.exit(0);
}

console.log(`=== Execution Timeline for Project: ${projectId} ===\n`);

events.forEach(event => {
    let line = `[${event.timestamp}] ${event.eventType}`;
    if (event.milestoneId) line += ` | Milestone: ${event.milestoneId.substring(0, 8)}`;
    if (event.issueId) line += ` | Issue: ${event.issueId.substring(0, 8)}`;
    if (event.agentRunId) line += ` | Run: ${event.agentRunId.substring(0, 8)}`;
    if (event.role) line += ` | Role: ${event.role}`;
    if (event.durationMs) line += ` | ${event.durationMs}ms`;
    if (event.status) line += ` | Status: ${event.status}`;
    if (event.message) line += ` | Message: ${event.message}`;
    
    console.log(line);
});

console.log(`\nTotal Events: ${events.length}`);
