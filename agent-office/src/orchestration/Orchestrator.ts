import { StateMachine } from "./StateMachine";
import { Athena } from "../agents/managers/athena/Athena";
import { Ares } from "../agents/managers/ares/Ares";
import { Apollo } from "../agents/managers/apollo/Apollo";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { Scheduler } from "./Scheduler";
import { AgentContext } from "../agents/base/AgentContext";
import { config } from "../config/config";
import crypto from "crypto";

const MAX_VERIFICATION_ATTEMPTS = 3;
const MAX_FIX_ATTEMPTS_PER_ISSUE = 2;

export class Orchestrator {
    constructor(
        private athena: Athena,
        private ares: Ares,
        private apollo: Apollo,
        private workerFactory: WorkerFactory,
        private projectRepo: ProjectRepository,
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private verificationRepo: VerificationRepository
    ) {}

    async runProject(projectId: string) {
        const project = this.projectRepo.get(projectId);
        if (!project) throw new Error("Project not found");

        const context: AgentContext = {
            projectId,
            workspaceRoot: require("path").join(config.workspaceRoot, projectId),
            projectSpec: project.specification
        };

        console.log(`[ORCHESTRATOR] Starting project: ${project.name}`);
        const state = new StateMachine("PLANNED");
        const scheduler = new Scheduler(this.issueRepo);

        try {
            console.log(`[ORCHESTRATOR] Phase: STRATEGY`);
            console.log(`[ATHENA] Generating milestone...`);
            
            const athenaResult = await this.athena.invoke(`Create the next milestone for the project: ${project.specification}`, context);
            if (!athenaResult.success || !athenaResult.data) throw new Error("Athena failed to generate milestone");
            
            const milestoneData = athenaResult.data;
            console.log(`[ATHENA] MILESTONE created: ${milestoneData.title}`);
            
            const milestoneId = crypto.randomUUID();
            this.milestoneRepo.create({
                id: milestoneId,
                projectId,
                title: milestoneData.title,
                description: milestoneData.description,
                status: "PLANNED",
                budget: milestoneData.budget,
                verificationAttempts: 0
            });

            // Create suggested tasks as PENDING issues
            if (milestoneData.suggestedTasks) {
                for (const t of milestoneData.suggestedTasks) {
                    this.issueRepo.create({
                        id: crypto.randomUUID(),
                        projectId,
                        milestoneId,
                        title: t.title,
                        description: t.title,
                        type: t.type,
                        priority: "MEDIUM",
                        status: "PENDING",
                        fixAttempts: 0,
                        attemptCount: 0
                    });
                }
            }

            context.currentMilestone = milestoneData;
            state.transition("ACTIVE");

            let running = true;
            while (running) {
                if (state.phase !== "EXECUTING") {
                    state.transition("EXECUTING");
                    this.milestoneRepo.updateStatus(milestoneId, "EXECUTING");
                }

                // Evaluate dependencies
                this.issueRepo.evaluateIssueStates(milestoneId);
                const allIssues = this.issueRepo.listByMilestone(milestoneId);
                
                const readyIssues = scheduler.getReadyIssues(milestoneId);
                const openOrBlocked = allIssues.filter(i => ["PENDING", "READY", "BLOCKED", "FAILED", "RUNNING", "OPEN"].includes(i.status));

                if (readyIssues.length > 0) {
                    console.log(`[ORCHESTRATOR] Phase: EXECUTION`);
                    console.log(`[ARES] Creating worker schedule for ${readyIssues.length} READY issues...`);
                    
                    const issueContext = `\nREADY Issues:\n${readyIssues.map(i => `- [${i.id}] ${i.title} (${i.priority})`).join("\n")}`;
                    
                    const aresResult = await this.ares.invoke(`Schedule workers for this milestone: ${JSON.stringify(context.currentMilestone)}${issueContext}\nProvide workers to achieve this and fix the issues.`, context);
                    if (!aresResult.success || !aresResult.data) throw new Error("Ares failed to create schedule");
                    
                    for (const scheduledTask of aresResult.data.tasks) {
                        const issue = this.issueRepo.get(scheduledTask.issueId);
                        if (!issue) continue;
                        
                        // Wait, check if issue was already resolved in this loop by a previous sequential task
                        if (issue.status === "RESOLVED" || issue.status === "VERIFIED") continue;

                        console.log(`[WORKER:${scheduledTask.workerRole}] Starting task for Issue ${issue.id}: ${scheduledTask.task}`);
                        this.issueRepo.updateStatus(issue.id, "RUNNING");
                        
                        let enrichedTask = scheduledTask.task;
                        if (context.verificationFeedback) {
                            enrichedTask += `\n\nContext from previous failure:\nEvidence: ${context.verificationFeedback.evidence.join(", ")}\nRequired Fixes: ${context.verificationFeedback.requiredFixes.join(", ")}`;
                        }

                        // We pass the issueId to the worker factory or context so it logs the correct agent run
                        context.currentIssueId = issue.id;
                        context.currentMilestoneId = milestoneId;

                        const worker = this.workerFactory.createWorker(scheduledTask.workerRole, enrichedTask);
                        const workerResult = await worker.executeTask(context);
                        
                        this.issueRepo.incrementAttemptCount(issue.id);

                        if (!workerResult.success || workerResult.data?.status === "FAILED") {
                            console.error(`[WORKER:${scheduledTask.workerRole}] Failed: ${workerResult.error || workerResult.data?.message}`);
                            this.issueRepo.updateStatus(issue.id, "FAILED");
                            this.issueRepo.incrementFixAttempts(issue.id);
                            
                            const updated = this.issueRepo.get(issue.id)!;
                            if (updated.fixAttempts >= MAX_FIX_ATTEMPTS_PER_ISSUE) {
                                console.log(`[ORCHESTRATOR] Issue ${issue.id} reached MAX_FIX_ATTEMPTS_PER_ISSUE (${MAX_FIX_ATTEMPTS_PER_ISSUE}). Stopping safely.`);
                                state.transition("FAILED");
                                this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                                running = false;
                                break;
                            }
                        } else {
                            console.log(`[WORKER:${scheduledTask.workerRole}] Success`);
                            this.issueRepo.updateStatus(issue.id, "RESOLVED");
                        }
                    }
                } else if (openOrBlocked.length > 0) {
                    // There are unresolved issues but none are READY. This means there's a deadlock or all are BLOCKED.
                    const blocked = allIssues.filter(i => i.status === "BLOCKED");
                    if (blocked.length > 0) {
                        console.error(`[ORCHESTRATOR] Deadlock detected: ${blocked.length} issues BLOCKED but 0 READY issues.`);
                        state.transition("FAILED");
                        this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                        running = false;
                        break;
                    }
                } else {
                    // All issues resolved. Proceed to verification.
                    state.transition("VERIFYING");
                    this.milestoneRepo.updateStatus(milestoneId, "VERIFYING");
                    console.log(`[ORCHESTRATOR] Phase: VERIFICATION`);
                    console.log(`[APOLLO] Verifying milestone...`);
                    
                    const apolloContext = `\nIssues:\n${allIssues.map(i => `- ${i.title} (${i.status})`).join("\n")}`;
                    const apolloResult = await this.apollo.invoke(`Verify if the milestone was completed. Milestone: ${JSON.stringify(context.currentMilestone)}${apolloContext}`, context);
                    
                    if (!apolloResult.success || !apolloResult.data) throw new Error("Apollo failed to verify");

                    const verification = apolloResult.data;
                    const milestoneRecord = this.milestoneRepo.getPendingByProject(projectId) || this.milestoneRepo.get(milestoneId)!;
                    const attemptNum = (milestoneRecord.verificationAttempts || 0) + 1;

                    this.verificationRepo.create({
                        id: crypto.randomUUID(),
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
                        state.transition("COMPLETED");
                        this.milestoneRepo.updateStatus(milestoneId, "COMPLETED");
                        
                        allIssues.forEach(issue => this.issueRepo.updateStatus(issue.id, "VERIFIED"));
                        
                        running = false;
                    } else {
                        console.log(`[APOLLO] FAIL. Required fixes: ${verification.requiredFixes?.join(", ")}`);
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
                                        status: "READY", // Make it ready immediately
                                        fixAttempts: 0,
                                        attemptCount: 0
                                    });
                                }
                            }
                        }
                        
                        state.transition("FAILED");
                    }
                }
            }
            
            const reporter = new (require("./Reporter").Reporter)(this.milestoneRepo, this.issueRepo, this.verificationRepo);
            reporter.generateMilestoneReport(projectId, milestoneId);
            
        } catch (error: any) {
            console.error(`[ORCHESTRATOR] Error in phase ${state.phase}:`, error.message);
            state.transition("FAILED");
        }
        
        console.log(`[ORCHESTRATOR] Project ended with state: ${state.phase}`);
    }
}
