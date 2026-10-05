import os

directory = 'src'
files = [f for f in os.listdir(directory) if f.startswith('demo') and f.endswith('.ts')]

for f in files:
    path = os.path.join(directory, f)
    with open(path, 'r') as file:
        content = file.read()
    
    # Clean up the orchestrator instantiation block completely
    
    # 1. First, we might have multiple checkpointRepo or reviewer declarations. 
    # Let's just find the part starting with 'const orchestrator = new Orchestrator(' 
    # up to the end of the line or the ');' and replace it exactly.
    import re
    
    content = re.sub(r'const orchestrator = new Orchestrator\([^;]+;', 'const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);', content)
    
    # 2. Check if reviewer is instantiated. If not, add it.
    if 'const reviewer =' not in content:
        if 'const checkpointRepo = new CheckpointRepository();' in content:
            content = content.replace('const checkpointRepo = new CheckpointRepository();', 'const checkpointRepo = new CheckpointRepository();\n    const reviewer = new Reviewer(modelRouter, runRepo);')
    
    # 3. We also have `router` vs `modelRouter` mismatch
    # If the file has `const router = new ModelRouter(provider);` then reviewer should use `router`.
    # If the file has `const modelRouter = new ModelRouter(provider);` then reviewer should use `modelRouter`.
    if 'const modelRouter = new ModelRouter(provider);' in content:
        content = content.replace('new Reviewer(router, runRepo)', 'new Reviewer(modelRouter, runRepo)')
        content = content.replace('new Athena(router, runRepo)', 'new Athena(modelRouter, runRepo)')
        content = content.replace('new Ares(router, runRepo)', 'new Ares(modelRouter, runRepo)')
        content = content.replace('new Apollo(router, runRepo)', 'new Apollo(modelRouter, runRepo)')
        content = content.replace('new WorkerFactory(router, runRepo', 'new WorkerFactory(modelRouter, runRepo')
    else:
        content = content.replace('new Reviewer(modelRouter, runRepo)', 'new Reviewer(router, runRepo)')
    
    with open(path, 'w') as file:
        file.write(content)

print("Demo files fixed!")
