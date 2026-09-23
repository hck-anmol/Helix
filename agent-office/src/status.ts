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

    console.log(`\nPhase:\n${milestone.status}`);
    console.log(`\nMilestone:\n${milestone.title}`);

    const issues = db.prepare(`SELECT * FROM issues WHERE milestoneId = ?`).all(milestone.id) as any[];
    
    if (issues.length > 0) {
        const resolved = issues.filter(i => ["RESOLVED", "SUCCESS", "VERIFIED"].includes(i.status)).length;
        const total = issues.length;
        const progress = Math.round((resolved / total) * 100);
        
        const filled = Math.floor(progress / 10);
        const empty = 10 - filled;
        const bar = "█".repeat(filled) + "░".repeat(empty);
        
        console.log(`\nProgress:\n${bar} ${progress}%`);
        console.log(`\nIssues:`);
        
        for (const issue of issues) {
            let marker = "○";
            if (["RESOLVED", "SUCCESS", "VERIFIED"].includes(issue.status)) marker = "✓";
            else if (issue.status === "RUNNING") marker = "●";
            
            console.log(`${marker} ${issue.title.padEnd(25)} ${issue.status}`);
        }
    } else {
        console.log(`\nProgress:\n░░░░░░░░░░ 0%`);
        console.log(`\nIssues:\nNone`);
    }

    const runs = db.prepare(`
        SELECT role, status FROM agent_runs 
        WHERE projectId = ? AND phase = 'EXECUTION' 
        ORDER BY startedAt DESC LIMIT 10
    `).all(project.id) as any[];
    
    if (runs.length > 0) {
        console.log(`\nWorkers:`);
        const seen = new Set();
        for (const run of runs) {
            if (!seen.has(run.role)) {
                console.log(`${run.role.padEnd(12)} ${run.status}`);
                seen.add(run.role);
            }
        }
    }

    const verifications = db.prepare(`SELECT * FROM verification_runs WHERE milestoneId = ? ORDER BY attemptNumber ASC`).all(milestone.id) as any[];
    console.log(`\nVerification:`);
    if (verifications.length > 0) {
        const last = verifications[verifications.length - 1];
        console.log(last.status);
    } else {
        console.log("Not started");
    }

    console.log("\n========================================");
}

renderStatus();
