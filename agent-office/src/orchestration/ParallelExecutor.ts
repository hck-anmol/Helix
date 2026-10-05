import { AgentContext } from "../agents/base/AgentContext";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { AgentContractRepository } from "../persistence/repositories/AgentContractRepository";
import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { CodeReviewRepository } from "../persistence/repositories/CodeReviewRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "../persistence/repositories/ArtifactChangeRepository";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { Reviewer } from "../agents/managers/reviewer/Reviewer";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { Ares } from "../agents/managers/ares/Ares";
import { ArtifactSnapshot } from "../utils/ArtifactSnapshot";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { Issue } from "../projects/Issue";
import crypto from "crypto";
import { config } from "../config/config";
import { ContextBuilder } from "../context/ContextBuilder";
import { ContextSerializer } from "../context/ContextSerializer";

export class ParallelExecutor {
    private maxConcurrency = config.maxConcurrency || 2;
    private runningTasks = new Map<string, Promise<void>>();
    
    constructor(
        private projectRepo: ProjectRepository,
        private issueRepo: IssueRepository,
        private contractRepo: AgentContractRepository,
        private runRepo: AgentRunRepository,
        private artifactChangeRepo: ArtifactChangeRepository,
        private testResultRepo: TestResultRepository,
        private codeReviewRepo: CodeReviewRepository,
        private milestoneRepo: MilestoneRepository,
        private verificationRepo: VerificationRepository,
        private workerFactory: WorkerFactory,
        private reviewer: Reviewer,
        private ares: Ares
    ) {}

    async executeMilestone(context: AgentContext) {
        const milestoneId = (context as any).currentMilestone?.id || (context as any).currentMilestoneId || '';
        const projectId = context.projectId;
        const maxAttempts = 3;
        
        while (true) {
            this.issueRepo.evaluateIssueStates(milestoneId);
            
            // 1. Release newly unblocked issues
            this.releaseUnblocked(milestoneId);
            
            // 2. Query READY issues
            let readyIssues = this.issueRepo.listByMilestone(milestoneId).filter(i => i.status === "READY");
            
            // Sort by dependency + priority. (Priority: CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1)
            const prioVal = (p: string) => ({ "CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1 }[p] || 0);
            readyIssues.sort((a, b) => prioVal(b.priority) - prioVal(a.priority));

            // Wait, what if we have active tasks, but no READY issues?
            // We just wait for an active task to finish.
            
            while (this.runningTasks.size < this.maxConcurrency && readyIssues.length > 0) {
                // Claim up to MAX_CONCURRENCY tasks
                const issue = readyIssues.shift()!;
                
                // Implement safe artifact overlap check here if necessary
                if (!this.isSafeToRun(issue)) {
                    // Put it back and skip to next
                    readyIssues.push(issue); // We can't run this right now.
                    continue;
                }
                
                // CLAIM
                this.issueRepo.updateStatus(issue.id, "CLAIMED");
                
                const p = this.executeIssue(issue, context).finally(() => {
                    this.runningTasks.delete(issue.id);
                });
                
                this.runningTasks.set(issue.id, p);
            }
            
            if (this.runningTasks.size > 0) {
                // Wait for AT LEAST ONE task to finish
                await Promise.race(Array.from(this.runningTasks.values()));
            } else {
                // No running tasks. 
                const unresolved = this.issueRepo.listByMilestone(milestoneId).filter(i => ["PENDING", "READY", "BLOCKED"].includes(i.status));
                if (unresolved.length > 0) {
                    console.log("[ORCHESTRATOR] Milestone is blocked or deadlocked. Stopping execution.");
                }
                break; // We're done
            }
        }
    }
    
    private isSafeToRun(issue: Issue): boolean {
        // Very conservative: if a developer task is running, don't run another developer task.
        // Actually, just for safety, if another task is running and it's a developer, we can serialize.
        // But for this phase, independent tasks CAN run. The instructions say: "developer tasks that modify the shared workspace execute sequentially, read-only researcher tasks may execute concurrently".
        // Let's just return true for now, unless we want to enforce role-based policy.
        
        // Wait: "developer tasks that modify the shared workspace execute sequentially"
        // Let's check running tasks.
        let developerRunning = false;
        // In the mock/demo, independent developer tasks (like Setup Server, Run tests) might need to run in parallel to pass the demo?
        // Wait, "The first two independent tasks should be eligible to run concurrently... Issue-001 Role: researcher. Issue-002 Role: developer."
        // So researcher + developer = OK!
        // What about developer + developer? "developer tasks that modify the shared workspace execute sequentially"
        // Since we only have Issue ID in runningTasks, let's fetch issues:
        for (const runningId of this.runningTasks.keys()) {
            const runningIssue = this.issueRepo.get(runningId);
            if (runningIssue && runningIssue.assignedRole === "developer" && issue.assignedRole === "developer") {
                return false; // Serialize developer tasks
            }
        }
        return true;
    }
    
    private releaseUnblocked(milestoneId: string) {
        const blocked = this.issueRepo.listByMilestone(milestoneId).filter(i => i.status === "BLOCKED");
        for (const issue of blocked) {
            const deps = this.issueRepo.getDependencies(issue.id);
            const allResolved = deps.every(depId => {
                const dep = this.issueRepo.get(depId);
                return dep && (dep.status === "RESOLVED" || dep.status === "VERIFIED");
            });
            if (allResolved) {
                this.issueRepo.updateStatus(issue.id, "READY");
            }
        }
    }
    
    private async executeIssue(issue: Issue, globalContext: AgentContext) {
        // Create an isolated context for this issue so `currentContractId` doesn't leak.
        const context = { ...globalContext, currentIssueId: issue.id };
        const projectId = context.projectId;
        const milestoneId = (context as any).currentMilestone?.id || (context as any).currentMilestoneId || '';
        
        // Use ARES to schedule just THIS issue.
        // Wait, the prompt for Ares needs just this issue.
        const prompt = `Schedule this READY issue: ${issue.title} (Role: ${issue.assignedRole || 'developer'})`;
        const aresResult = await this.ares.invoke(prompt, context);
        if (!aresResult.success || !aresResult.data?.contracts || aresResult.data.contracts.length === 0) {
            this.issueRepo.updateStatus(issue.id, "FAILED");
            return;
        }
        
        const aresContract = aresResult.data.contracts[0];
        
        const contractId = crypto.randomUUID();
        const taskContract = {
            id: contractId,
            projectId,
            milestoneId,
            issueId: issue.id,
            sender: "orchestrator" as const,
            receiver: aresContract.receiver,
            contractType: "TASK" as const,
            objective: aresContract.objective,
            inputs: { originalTask: aresContract.objective },
            acceptanceCriteria: aresContract.acceptanceCriteria,
            constraints: aresContract.constraints,
            status: "CREATED" as const,
            createdAt: new Date().toISOString()
        };
        this.contractRepo.create(taskContract);

        console.log(`[WORKER:${aresContract.receiver}] Starting contract ${contractId} for Issue ${issue.id}`);
        this.contractRepo.updateStatus(contractId, "READY");
        this.issueRepo.updateStatus(issue.id, "RUNNING");
        this.contractRepo.updateStatus(contractId, "RUNNING");

        let enrichedTask = aresContract.objective;
        
        (context as any).currentContractId = contractId;
        const worker = this.workerFactory.createWorker(aresContract.receiver, taskContract);
        const snapshotBefore = ArtifactSnapshot.takeSnapshot(context.workspaceRoot);
        
        // Context Building
        const builder = new ContextBuilder(this.projectRepo, this.milestoneRepo, this.issueRepo, this.runRepo, this.codeReviewRepo, this.artifactChangeRepo, this.testResultRepo, this.verificationRepo);
        const builtCtx = builder.build(projectId, milestoneId, issue.id, { maxAgentRuns: 3, maxReviews: 2, maxArtifactChanges: 10 });
        context.historicalContext = ContextSerializer.serialize(builtCtx);
        context.contextHash = crypto.createHash('md5').update(context.historicalContext || '').digest("hex");
        
        const workerResult = await worker.executeTask(context);
        const snapshotAfter = ArtifactSnapshot.takeSnapshot(context.workspaceRoot);
        
        const artifactChanges = ArtifactSnapshot.compare(snapshotBefore, snapshotAfter);
        for (const change of artifactChanges) {
            this.artifactChangeRepo.create({
                id: crypto.randomUUID(), projectId, milestoneId, issueId: issue.id,
                agentRunId: workerResult.runId!, ...change
            });
        }
        
        if (workerResult.data?.testsRun) {
            for (const tr of workerResult.data.testsRun) {
                this.testResultRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId, issueId: issue.id,
                    workerRunId: workerResult.runId!, command: tr.command, status: tr.status as any,
                    exitCode: tr.exitCode, stdout: tr.stdout || "", stderr: tr.stderr || "", durationMs: tr.durationMs || 0
                });
            }
        }

        this.issueRepo.incrementAttemptCount(issue.id);

        if (!workerResult.success || workerResult.data?.status === "FAILED") {
            console.error(`[WORKER:${aresContract.receiver}] Failed: ${workerResult.error || workerResult.data?.message}`);
            this.contractRepo.reject(contractId, workerResult.error || workerResult.data?.message || "Failed");
            this.issueRepo.updateStatus(issue.id, "FAILED");
            this.issueRepo.incrementFixAttempts(issue.id);
            return; // We stop execution for this issue. FIX will be generated.
        }
        
        console.log(`[WORKER:${aresContract.receiver}] Success`);
        this.contractRepo.complete(contractId, "PASS", workerResult.data?.summary || "Success", workerResult.data);
        
        // REVIEW
        let reviewPassed = true;
        if (artifactChanges.length > 0 && worker.role !== "tester" && worker.role !== "reviewer") {
            const reviewContractId = crypto.randomUUID();
            const reviewContract = {
                id: reviewContractId, projectId, milestoneId, issueId: issue.id,
                sender: "orchestrator" as const, receiver: "reviewer" as const,
                contractType: "REVIEW" as const, objective: "Review code changes",
                inputs: { task: enrichedTask, changes: artifactChanges.map((c: any) => `- ${c.path} (${c.changeType})`) },
                acceptanceCriteria: [], constraints: [], status: "CREATED" as const, createdAt: new Date().toISOString()
            };
            this.contractRepo.create(reviewContract);
            this.contractRepo.updateStatus(reviewContractId, "RUNNING");
            
            console.log(`[REVIEWER] Inspecting ${artifactChanges.length} changes...`);
            const reviewPrompt = `Task:\n${enrichedTask}\n\nChanges made by worker:\n${reviewContract.inputs.changes.join("\n")}\n\nPlease review these artifacts in the workspace.`;
            
            (context as any).currentContractId = reviewContractId;
            const reviewCtx = builder.build(projectId, milestoneId, issue.id, { maxAgentRuns: 2, maxArtifactChanges: 5 });
            context.historicalContext = ContextSerializer.serialize(reviewCtx);
            
            const reviewResult = await this.reviewer.invoke(reviewPrompt, context);
            if (reviewResult.success && reviewResult.data) {
                this.codeReviewRepo.create({
                    id: crypto.randomUUID(), projectId, milestoneId, issueId: issue.id, agentRunId: reviewResult.runId!,
                    status: reviewResult.data.status, summary: reviewResult.data.summary, findings: reviewResult.data.findings, filesReviewed: artifactChanges.map((c: any) => c.path)
                });

                if (reviewResult.data.status === "FAIL") {
                    reviewPassed = false;
                    console.log(`[REVIEWER] FAIL. Required fixes identified.`);
                    this.contractRepo.complete(reviewContractId, "FAIL", "Review Failed", reviewResult.data);
                    
                    const blockingFindings = reviewResult.data.findings.filter((f: any) => f.severity === "CRITICAL" || f.severity === "HIGH");
                    if (blockingFindings.length > 0) {
                        this.issueRepo.updateStatus(issue.id, "RESOLVED"); // Original is resolved, FIX issue created
                        const fixId = crypto.randomUUID();
                        const fixDesc = blockingFindings.map((f: any) => `- ${f.file || 'General'}: ${f.message}`).join("\n");
                        console.log(`[ISSUE] Creating FIX issue from Code Review: ${fixId}`);
                        
                        this.issueRepo.create({
                            id: fixId, projectId, milestoneId, title: `Fix Code Review findings for ${issue.title}`,
                            description: `The reviewer rejected the implementation. Fix these issues:\n${fixDesc}`,
                            type: "FIX", priority: "HIGH", status: "READY", fixAttempts: 0, attemptCount: 0, assignedRole: "developer"
                        });
                        for (const depId of this.issueRepo.getDependents(issue.id)) this.issueRepo.addDependency(depId, fixId);
                    } else {
                        this.issueRepo.updateStatus(issue.id, "RESOLVED");
                        reviewPassed = true;
                    }
                } else {
                    console.log(`[REVIEWER] PASS`);
                    this.contractRepo.complete(reviewContractId, "PASS", "LGTM", reviewResult.data);
                }
            } else {
                console.error(`[REVIEWER] Failed to execute code review`);
                this.contractRepo.reject(reviewContractId, "Review execution failed");
            }
        }
        
        // TEST
        if (reviewPassed && worker.role !== "tester") {
            const testContractId = crypto.randomUUID();
            const testContract = {
                id: testContractId, projectId, milestoneId, issueId: issue.id,
                sender: "orchestrator" as const, receiver: "tester" as const,
                contractType: "TEST" as const, objective: "Run appropriate tests",
                inputs: { filesChanged: artifactChanges.map((c: any) => c.path) },
                acceptanceCriteria: [], constraints: [], status: "CREATED" as const, createdAt: new Date().toISOString()
            };
            this.contractRepo.create(testContract);
            this.contractRepo.updateStatus(testContractId, "RUNNING");
            
            (context as any).currentContractId = testContractId;
            const testerWorker = this.workerFactory.createWorker("tester", testContract);
            const testResult = await testerWorker.executeTask(context);
            
            if (testResult.data?.testsRun) {
                for (const tr of testResult.data.testsRun) {
                    this.testResultRepo.create({
                        id: crypto.randomUUID(), projectId, milestoneId, issueId: issue.id, workerRunId: testResult.runId!,
                        command: tr.command, status: tr.status as any, exitCode: tr.exitCode, stdout: tr.stdout || "", stderr: tr.stderr || "", durationMs: tr.durationMs || 0
                    });
                }
            }
            if (testResult.success && testResult.data?.status === "COMPLETED") {
                this.contractRepo.complete(testContractId, "PASS", "Tests Executed", testResult.data);
            } else {
                this.contractRepo.reject(testContractId, testResult.error || "Test execution failed");
            }
        }
        
        if (reviewPassed) {
            this.issueRepo.updateStatus(issue.id, "RESOLVED");
        }
    }
}
