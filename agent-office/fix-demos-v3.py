import os
import re

dir = 'src'
files = [f for f in os.listdir(dir) if f.startswith('demo') and f.endswith('.ts')]

for f in files:
    path = os.path.join(dir, f)
    with open(path, 'r') as file:
        content = file.read()

    # 1. Add missing imports
    imports_to_add = [
        "import { Reviewer } from \"./agents/managers/reviewer/Reviewer\";",
        "import { CheckpointRepository } from \"./persistence/repositories/CheckpointRepository\";",
        "import { TestResultRepository } from \"./persistence/repositories/TestResultRepository\";",
        "import { ArtifactChangeRepository } from \"./persistence/repositories/ArtifactChangeRepository\";",
        "import { CodeReviewRepository } from \"./persistence/repositories/CodeReviewRepository\";"
    ]
    for imp in imports_to_add:
        if imp.split('{ ')[1].split(' }')[0] not in content:
            content = content.replace('import { Orchestrator } from "./orchestration/Orchestrator";', imp + '\nimport { Orchestrator } from "./orchestration/Orchestrator";')

    # 2. Inject missing repo instantiations before orchestrator
    # We will find where `const orchestrator = new Orchestrator` is, and insert all the repos if they are missing
    
    instantiations = """
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer = new Reviewer(router, runRepo);
    """
    
    # But wait, some scripts use `modelRouter` instead of `router`
    if 'const modelRouter =' in content:
        instantiations = instantiations.replace('router', 'modelRouter')
    
    # We will just replace `const orchestrator = new Orchestrator(...);`
    # with the full block, but first we must strip existing `reviewer`, `testResultRepo` etc from the script to avoid duplicates.
    content = re.sub(r'const testResultRepo[^\n]*\n', '', content)
    content = re.sub(r'const artifactChangeRepo[^\n]*\n', '', content)
    content = re.sub(r'const codeReviewRepo[^\n]*\n', '', content)
    content = re.sub(r'const checkpointRepo[^\n]*\n', '', content)
    content = re.sub(r'const reviewer = new.*?;\n', '', content)
    
    content = re.sub(r'const orchestrator = new Orchestrator\([^;]+;', instantiations + '\n    const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);', content)
    
    with open(path, 'w') as file:
        file.write(content)

# Fix demo-resume.ts
with open('src/demo-resume.ts', 'r') as file:
    content = file.read()
content = content.replace('const reviewer = new Reviewer(router, runRepo);', 'const reviewer = new Reviewer(router1, runRepo);')
content = content.replace('const reviewer = new Reviewer(modelRouter, runRepo);', 'const reviewer = new Reviewer(router1, runRepo);')
# demo-resume uses router1 and router2, but my script above injected `router`
content = content.replace('const reviewer = new Reviewer(router, runRepo);', 'const reviewer = new Reviewer(router1, runRepo);')
with open('src/demo-resume.ts', 'w') as file:
    file.write(content)

# Fix Repos imports
repos = ['TestResultRepository.ts', 'CodeReviewRepository.ts', 'ArtifactChangeRepository.ts']
for r in repos:
    p = os.path.join('src/persistence/repositories', r)
    with open(p, 'r') as file:
        c = file.read()
    c = re.sub(r'import \{.*?\} from "\.\.\/\.\.\/projects\/.*?";\n', '', c)
    with open(p, 'w') as file:
        file.write(c)

print("Fixed!")
