import os, re

files = [f for f in os.listdir('src') if f.startswith('demo') and f.endswith('.ts')]

for f in files:
    path = os.path.join('src', f)
    with open(path, 'r') as file:
        content = file.read()
    
    # 1. ADD MISSING IMPORTS
    imports = [
        'import { Reviewer } from "./agents/managers/reviewer/Reviewer";',
        'import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";',
        'import { TestResultRepository } from "./persistence/repositories/TestResultRepository";',
        'import { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";',
        'import { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";'
    ]
    for imp in imports:
        if imp not in content:
            content = content.replace('import { Orchestrator } from "./orchestration/Orchestrator";', imp + '\nimport { Orchestrator } from "./orchestration/Orchestrator";')

    # 2. REMOVE ALL PREVIOUS DECLARATIONS
    content = re.sub(r'const\s+testResultRepo.*?\n', '', content)
    content = re.sub(r'const\s+artifactChangeRepo.*?\n', '', content)
    content = re.sub(r'const\s+codeReviewRepo.*?\n', '', content)
    content = re.sub(r'const\s+checkpointRepo.*?\n', '', content)
    content = re.sub(r'const\s+reviewer\b.*?\n', '', content)
    content = re.sub(r'const\s+reviewer1.*?\n', '', content)
    content = re.sub(r'const\s+reviewer2.*?\n', '', content)

    # 3. FIX ORCHESTRATOR INSTANTIATIONS
    if f == 'demo-resume.ts':
        # Find 'const orchestrator1 = new Orchestrator(...)'
        inst1 = """
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer1 = new Reviewer(router1, runRepo);
    const orchestrator1 = new Orchestrator(athena1, ares1, apollo1, reviewer1, workerFactory1, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        """
        # We need to replace the entire orchestrator1 block, which spans multiple lines.
        content = re.sub(r'const\s+orchestrator1\s*=\s*new\s+Orchestrator\([^;]+;', inst1, content)
        
        inst2 = """
    const reviewer2 = new Reviewer(router2, runRepo);
    const orchestrator2 = new Orchestrator(athena2, ares2, apollo2, reviewer2, workerFactory2, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        """
        content = re.sub(r'const\s+orchestrator2\s*=\s*new\s+Orchestrator\([^;]+;', inst2, content)
    else:
        router_var = 'modelRouter' if 'const modelRouter =' in content else 'router'
        inst = f"""
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer = new Reviewer({router_var}, runRepo);
    const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        """
        # Replace the first or only occurrence of orchestrator
        content = re.sub(r'const\s+orchestrator\s*=\s*new\s+Orchestrator\([^;]+;', inst, content)
    
    with open(path, 'w') as file:
        file.write(content)
