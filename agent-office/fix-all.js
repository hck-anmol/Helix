const fs = require('fs');
const files = fs.readdirSync('src').filter(f => f.startsWith('demo') && f.endsWith('.ts'));

files.forEach(f => {
    let content = fs.readFileSync('src/' + f, 'utf8');
    
    // Fix imports
    const imports = [
        'import { Reviewer } from "./agents/managers/reviewer/Reviewer";',
        'import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";',
        'import { TestResultRepository } from "./persistence/repositories/TestResultRepository";',
        'import { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";',
        'import { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";'
    ];
    
    imports.forEach(imp => {
        if (!content.includes(imp)) {
            content = content.replace(/import { Orchestrator } from "\.\/orchestration\/Orchestrator";/, imp + '\nimport { Orchestrator } from "./orchestration/Orchestrator";');
        }
    });

    // Strip bad instantiations
    content = content.replace(/const reviewer.*?\n/g, '');
    content = content.replace(/const testResultRepo.*?\n/g, '');
    content = content.replace(/const artifactChangeRepo.*?\n/g, '');
    content = content.replace(/const codeReviewRepo.*?\n/g, '');
    content = content.replace(/const checkpointRepo.*?\n/g, '');

    const r_name = content.includes('const modelRouter =') ? 'modelRouter' : 'router';

    if (f === 'demo-resume.ts') {
        const inst1 = `
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer1 = new Reviewer(router1, runRepo);
    const orchestrator1 = new Orchestrator(athena1, ares1, apollo1, reviewer1, workerFactory1, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        `;
        const inst2 = `
    const reviewer2 = new Reviewer(router2, runRepo);
    const orchestrator2 = new Orchestrator(athena2, ares2, apollo2, reviewer2, workerFactory2, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        `;
        content = content.replace(/const orchestrator1 = new Orchestrator\([^;]+;/g, inst1);
        content = content.replace(/const orchestrator2 = new Orchestrator\([^;]+;/g, inst2);
    } else {
        const inst = `
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer = new Reviewer(${r_name}, runRepo);
    const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        `;
        content = content.replace(/const orchestrator = new Orchestrator\([^;]+;/g, inst);
    }

    fs.writeFileSync('src/' + f, content);
});
