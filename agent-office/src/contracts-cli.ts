import { db } from "./persistence/database";

function listContracts() {
    console.log("========================================");
    console.log("          AGENT CONTRACTS");
    console.log("========================================");

    const project = db.prepare(`SELECT * FROM projects ORDER BY createdAt DESC LIMIT 1`).get() as any;
    if (!project) {
        console.log("No projects found.");
        return;
    }
    
    console.log(`Project: ${project.name}\n`);
    
    const contracts = db.prepare(`SELECT * FROM agent_contracts WHERE projectId = ? ORDER BY createdAt ASC`).all(project.id) as any[];
    if (contracts.length === 0) {
        console.log("No contracts found for this project.");
        return;
    }
    
    for (const contract of contracts) {
        console.log(`[${contract.status}] ${contract.contractType} -> ${contract.receiver} (Sender: ${contract.sender})`);
        console.log(`   Objective: ${contract.objective}`);
        console.log(`   ID: ${contract.id}`);
        if (contract.resultStatus) {
            console.log(`   Result: ${contract.resultStatus}`);
            console.log(`   Summary: ${contract.resultSummary}`);
        }
        console.log("----------------------------------------");
    }
}

listContracts();
