import { db } from "./persistence/database";

function renderStatus() {
    console.log("========================================");
    console.log("          AGENT OFFICE STATUS");
    console.log("========================================");

    const project = db.prepare(`SELECT * FROM projects ORDER BY createdAt DESC LIMIT 1`).get() as any;
    if (!project) {
        console.log("No projects found.");
        return;
    }

    console.log(`\nProject:\n${project.name}`);
    
    const milestone = db.prepare(`SELECT * FROM milestones WHERE projectId = ? ORDER BY id DESC LIMIT 1`).get(project.id) as any;
    if (!milestone) {
        console.log(`\nPhase:\n${project.currentPhase}`);
        return;
    }

    console.log(`\nPhase:\n${project.currentPhase}`);
    console.log(`\nMilestone:\n${milestone.title}`);
    console.log(`\nMilestone Status:\n${milestone.status}`);

    const issues = db.prepare(`SELECT * FROM issues WHERE milestoneId = ?`).all(milestone.id) as any[];
    if (issues.length > 0) {
        console.log(`\nIssues:`);
        for (const issue of issues) {
            const marker = issue.status === "VERIFIED" ? "✓" : "✗";
            console.log(`${marker} ${issue.title} (${issue.status})`);
        }
    }

    const runs = db.prepare(`
        SELECT role, status FROM agent_runs 
        WHERE projectId = ? AND phase = 'EXECUTION' 
        ORDER BY startedAt DESC LIMIT 10
    `).all(project.id) as any[];
    
    if (runs.length > 0) {
        console.log(`\nWorkers (Latest runs):`);
        const seen = new Set();
        for (const run of runs) {
            if (!seen.has(run.role)) {
                console.log(`${run.role.padEnd(12)} ${run.status}`);
                seen.add(run.role);
            }
        }
    }

    const verifications = db.prepare(`SELECT * FROM verification_runs WHERE milestoneId = ? ORDER BY attemptNumber ASC`).all(milestone.id) as any[];
    if (verifications.length > 0) {
        console.log(`\nVerification:`);
        for (const v of verifications) {
            console.log(`Attempt ${v.attemptNumber}: ${v.status}`);
        }
    }

    console.log("\n========================================");
}

renderStatus();
