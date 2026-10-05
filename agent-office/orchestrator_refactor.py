import re

with open("src/orchestration/Orchestrator.ts", "r") as f:
    code = f.read()

# Remove executePhase implementation
start_idx = code.find("private async executePhase(context: AgentContext) {")
end_idx = code.find("private async verifyMilestone(", start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find executePhase or verifyMilestone")
    exit(1)

new_execute_phase = """
    private async executePhase(context: AgentContext) {
        const state = new StateMachine();
        state.transition("STRATEGY");
        state.transition("EXECUTION");
        const milestoneId = context.currentMilestoneId!;
        
        const executor = new ParallelExecutor(
            this.issueRepo,
            this.contractRepo,
            this.runRepo,
            this.artifactChangeRepo,
            this.testResultRepo,
            this.codeReviewRepo,
            this.milestoneRepo,
            this.workerFactory,
            this.reviewer,
            this.ares
        );
        
        await executor.executeMilestone(context);
        
        // After execution is done, check if milestone is blocked or failed
        const unresolved = this.issueRepo.listByMilestone(milestoneId).filter(i => ["PENDING", "READY", "BLOCKED"].includes(i.status));
        if (unresolved.length > 0) {
            console.log("[ORCHESTRATOR] Execution stopped but unresolved issues remain. Marking milestone as FAILED.");
            this.milestoneRepo.updateStatus(milestoneId, "FAILED");
        }
    }
"""

code = code[:start_idx] + new_execute_phase + "\n    " + code[end_idx:]
code = 'import { ParallelExecutor } from "./ParallelExecutor";\n' + code

with open("src/orchestration/Orchestrator.ts", "w") as f:
    f.write(code)

