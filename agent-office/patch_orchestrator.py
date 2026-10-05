import re

with open("src/orchestration/Orchestrator.ts", "r") as f:
    code = f.read()

# 1. Update constructor to include checkpointRepo optional
sig = r"(private codeReviewRepo: CodeReviewRepository\n\s*\) \{)"
code = re.sub(sig, r"\1\n        this.checkpointRepo = arguments[12];\n", code)

# add checkpointRepo to class properties
code = re.sub(r"private runRepo = new AgentRunRepository\(\);", r"private runRepo = new AgentRunRepository();\n    public checkpointRepo?: any;", code)

# 2. Add resumeProject implementation
resume_code = """
    async resumeProject(projectId: string) {
        console.log("[ORCHESTRATOR] Resuming project " + projectId);
        // Fallback to runProject for now in ParallelExecutor branch
        return this.runProject(projectId);
    }

    async runProject(projectId: string) {
"""
code = code.replace("    async runProject(projectId: string) {", resume_code)

with open("src/orchestration/Orchestrator.ts", "w") as f:
    f.write(code)

