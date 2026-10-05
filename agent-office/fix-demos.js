const fs = require('fs');
const files = fs.readdirSync('src').filter(f => f.startsWith('demo') && f.endsWith('.ts'));

files.forEach(f => {
    let content = fs.readFileSync('src/' + f, 'utf8');
    
    // Add imports if missing
    if (!content.includes('TestResultRepository')) {
        content = content.replace(
            /import \{ Orchestrator \} from "\.\/orchestration\/Orchestrator";/, 
            `import { TestResultRepository } from "./persistence/repositories/TestResultRepository";\nimport { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";\nimport { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";\nimport { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";\nimport { Reviewer } from "./agents/managers/reviewer/Reviewer";\nimport { Orchestrator } from "./orchestration/Orchestrator";`
        );
    }
    
    // Add instantiations if missing
    if (!content.includes('testResultRepo = new')) {
        content = content.replace(
            /const verificationRepo = new VerificationRepository\(\);/,
            `const verificationRepo = new VerificationRepository();\n    const testResultRepo = new TestResultRepository();\n    const artifactChangeRepo = new ArtifactChangeRepository();\n    const codeReviewRepo = new CodeReviewRepository();\n    const checkpointRepo = new CheckpointRepository();\n    const reviewer = new Reviewer(router, runRepo);`
        );
    }
    
    fs.writeFileSync('src/' + f, content);
    console.log(`Updated ${f}`);
});
