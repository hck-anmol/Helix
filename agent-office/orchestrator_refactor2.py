import re

with open("src/orchestration/Orchestrator.ts", "r") as f:
    code = f.read()

# We need to replace the entire body of private async executePhase(context: AgentContext)
# Let's locate the start and end of it.
start_str = "private async executePhase(context: AgentContext) {"
start_idx = code.find(start_str)

if start_idx == -1:
    print("Could not find executePhase")
    exit(1)

# Find the end of executePhase
# The next method is `private _injectContext`
next_method_str = "private _injectContext(context: AgentContext, limits?: { maxAgentRuns?: number, maxReviews?: number, maxArtifactChanges?: number, maxTestResults?: number, maxVerificationRuns?: number }) {"
end_idx = code.find(next_method_str)

if end_idx == -1:
    print("Could not find _injectContext")
    exit(1)

new_execute_phase = """private async executePhase(context: AgentContext) {
        const state = new StateMachine();
        state.transition("STRATEGY");
        state.transition("EXECUTION");
        const milestoneId = context.currentMilestoneId!;
        const projectId = context.projectId;
        
        let attempts = 0;
        const MAX_VERIFICATION_ATTEMPTS = 3;
        
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

        let running = true;
        while (running && attempts < MAX_VERIFICATION_ATTEMPTS) {
            attempts++;
            
            // Execute the issues using ParallelExecutor
            await executor.executeMilestone(context);

            const allIssues = this.issueRepo.listByMilestone(milestoneId);
            const unresolved = allIssues.filter(i => ["PENDING", "READY", "BLOCKED"].includes(i.status));
            
            if (unresolved.length > 0) {
                // There are unresolved issues but executor finished. Deadlock or failed issues?
                console.error(`[ORCHESTRATOR] Deadlock detected: ${unresolved.length} unresolved issues but 0 READY issues.`);
                state.transition("FAILED");
                this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                running = false;
                break;
            }

            // All issues resolved. Proceed to verification.
            state.transition("VERIFYING");
            this.milestoneRepo.updateStatus(milestoneId, "VERIFYING");
            console.log(`[ORCHESTRATOR] Phase: VERIFICATION`);
            console.log(`[APOLLO] Verifying milestone...`);
            
            const testRuns = this.testResultRepo.listByMilestone(milestoneId);
            const testsContext = testRuns.map(tr => `[Test] ${tr.command} | Exit: ${tr.exitCode} | Status: ${tr.status}\\nSTDOUT: ${tr.stdout}\\nSTDERR: ${tr.stderr}`).join("\\n\\n");
            const apolloContext = `\\nIssues:\\n${allIssues.map(i => `- ${i.title} (${i.status})`).join("\\n")}\\n\\nTest Evidence:\\n${testsContext}`;
            
            // VERIFICATION CONTRACT
            const verificationContractId = crypto.randomUUID();
            const verificationContract = {
                id: verificationContractId,
                projectId, milestoneId, issueId: undefined,
                sender: "orchestrator" as const, receiver: "apollo" as const,
                contractType: "VERIFICATION" as const,
                objective: "Verify milestone completion",
                inputs: { testEvidence: testRuns.length },
                acceptanceCriteria: [], constraints: [],
                status: "CREATED" as const, createdAt: new Date().toISOString()
            };
            this.contractRepo.create(verificationContract);
            this.contractRepo.updateStatus(verificationContractId, "RUNNING");
            
            context.currentContractId = verificationContractId;
            this._injectContext(context, { maxVerificationRuns: 2, maxTestResults: 10 });
            if (context.contextHash) this.contractRepo.updateContextHash(verificationContractId, context.contextHash);
            
            const apolloResult = await this.apollo.invoke(`Verify if the milestone was completed. Milestone: ${JSON.stringify(context.currentMilestone)}${apolloContext}`, context);
            
            if (!apolloResult.success || !apolloResult.data) {
                this.contractRepo.reject(verificationContractId, "Verification execution failed");
                throw new Error("Apollo failed to verify");
            }

            const verification = apolloResult.data;
            const milestoneRecord = this.milestoneRepo.getPendingByProject(projectId) || this.milestoneRepo.get(milestoneId)!;
            const attemptNum = (milestoneRecord.verificationAttempts || 0) + 1;

            const verificationRunId = crypto.randomUUID();
            this.verificationRepo.create({
                id: verificationRunId,
                milestoneId,
                attemptNumber: attemptNum,
                status: verification.status,
                evidence: JSON.stringify(verification.evidence),
                failures: JSON.stringify(verification.failures || []),
                requiredFixes: JSON.stringify(verification.requiredFixes || [])
            });

            this.milestoneRepo.incrementVerificationAttempts(milestoneId);

            if (verification.status === "PASS") {
                console.log(`[APOLLO] PASS`);
                this.contractRepo.complete(verificationContractId, "PASS", "Milestone Verified", verification);
                state.transition("COMPLETED");
                this.milestoneRepo.updateStatus(milestoneId, "COMPLETED");
                
                allIssues.forEach(issue => this.issueRepo.updateStatus(issue.id, "VERIFIED"));
                
                running = false;
            } else {
                console.log(`[APOLLO] FAIL. Required fixes: ${verification.requiredFixes?.join(", ")}`);
                this.contractRepo.complete(verificationContractId, "FAIL", "Verification Failed", verification);
                context.verificationFeedback = verification;
                
                if (attemptNum >= MAX_VERIFICATION_ATTEMPTS) {
                    console.log(`[ORCHESTRATOR] Reached MAX_VERIFICATION_ATTEMPTS (${MAX_VERIFICATION_ATTEMPTS}). Stopping safely.`);
                    state.transition("FAILED");
                    this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                    running = false;
                    break;
                }

                if (verification.requiredFixes) {
                    for (const fix of verification.requiredFixes) {
                        const exists = allIssues.some(i => i.title === fix);
                        if (!exists) {
                            console.log(`[ISSUE] Creating FIX issue: ${fix}`);
                            this.issueRepo.create({
                                id: crypto.randomUUID(),
                                projectId,
                                milestoneId,
                                title: fix,
                                description: `Required fix identified by Apollo: ${fix}`,
                                type: "FIX",
                                priority: "HIGH",
                                status: "READY",
                                fixAttempts: 0,
                                attemptCount: 0,
                                assignedRole: "developer"
                            });
                        }
                    }
                }
            }
        }
    }

    """

code = code[:start_idx] + new_execute_phase + code[end_idx:]

if 'import { ParallelExecutor }' not in code:
    code = 'import { ParallelExecutor } from "./ParallelExecutor";\n' + code

with open("src/orchestration/Orchestrator.ts", "w") as f:
    f.write(code)
