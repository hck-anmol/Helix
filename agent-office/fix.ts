import fs from "fs";
import path from "path";

const dir = "src";
const files = fs.readdirSync(dir).filter(f => f.startsWith("demo") && f.endsWith(".ts"));

for (const file of files) {
    let content = fs.readFileSync(path.join(dir, file), "utf8");
    
    // Fix Duplicate Reviewer issue
    const doubleReviewerRegex = /const reviewer = new \(require\([^)]+\)\.Reviewer\)\([^)]+\);\s*/g;
    content = content.replace(doubleReviewerRegex, "");

    // Fix imports if CheckpointRepository is missing
    if (!content.includes("CheckpointRepository")) {
        content = content.replace(
            `import { Orchestrator } from "./orchestration/Orchestrator";`,
            `import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";\nimport { Orchestrator } from "./orchestration/Orchestrator";`
        );
    }

    // Fix the Orchestrator instantiation block
    // Let's just find "const orchestrator = new Orchestrator(" and replace the entire line
    const orchestratorRegex = /const orchestrator = new Orchestrator\([^;]+;/g;
    content = content.replace(
        orchestratorRegex,
        "const checkpointRepo = new CheckpointRepository();\n    const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);"
    );

    // Some files might now have multiple `const checkpointRepo = new CheckpointRepository();` lines
    // Remove duplicates
    let checkpointRepoCount = 0;
    const lines = content.split("\n");
    const newLines = [];
    for (const line of lines) {
        if (line.includes("const checkpointRepo = new CheckpointRepository();")) {
            checkpointRepoCount++;
            if (checkpointRepoCount > 1) continue;
        }
        newLines.push(line);
    }
    content = newLines.join("\n");

    // Replace router with modelRouter where reviewer was instantiated with router but it should be modelRouter
    content = content.replace(/const reviewer = new Reviewer\(router, runRepo\);/g, "const reviewer = new Reviewer(modelRouter || router, runRepo);");

    fs.writeFileSync(path.join(dir, file), content);
}

// Fix Reporter and IssueRepository typescript errors
let issueRepoContent = fs.readFileSync("src/persistence/repositories/IssueRepository.ts", "utf8");
issueRepoContent = issueRepoContent.replace(
    /export interface IssueRecord \{[\s\S]*?\}/,
    `export interface IssueRecord {\n    id: string;\n    projectId: string;\n    milestoneId: string;\n    title: string;\n    description: string;\n    type: string;\n    priority: string;\n    status: string;\n    assignedRole?: string;\n    fixAttempts: number;\n    attemptCount: number;\n    sourceVerificationId?: string;\n    createdAt?: string;\n    updatedAt?: string;\n}`
);
issueRepoContent = issueRepoContent.replace(
    /INSERT INTO issues \(id, projectId, milestoneId, title, description, type, priority, status, assignedRole, fixAttempts\)/g,
    `INSERT INTO issues (id, projectId, milestoneId, title, description, type, priority, status, assignedRole, fixAttempts, attemptCount, sourceVerificationId)`
);
issueRepoContent = issueRepoContent.replace(
    /VALUES \(@id, @projectId, @milestoneId, @title, @description, @type, @priority, @status, @assignedRole, @fixAttempts\)/g,
    `VALUES (@id, @projectId, @milestoneId, @title, @description, @type, @priority, @status, @assignedRole, @fixAttempts, @attemptCount, @sourceVerificationId)`
);
fs.writeFileSync("src/persistence/repositories/IssueRepository.ts", issueRepoContent);

// Fix TestResult / CodeReview imports in Repos
const repos = [
    "TestResultRepository.ts",
    "CodeReviewRepository.ts",
    "ArtifactChangeRepository.ts"
];

for (const repo of repos) {
    const p = path.join("src/persistence/repositories", repo);
    let c = fs.readFileSync(p, "utf8");
    c = c.replace(/import \{.*?\} from "\.\.\/\.\.\/projects\/.*?";/, "");
    fs.writeFileSync(p, c);
}

console.log("Fixes applied!");
