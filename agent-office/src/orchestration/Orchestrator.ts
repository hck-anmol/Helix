import { StateMachine } from "./StateMachine";
import { Athena } from "../agents/managers/athena/Athena";
import { Ares } from "../agents/managers/ares/Ares";
import { Apollo } from "../agents/managers/apollo/Apollo";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
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

            context.currentMilestone = milestoneData;
            state.transition("ACTIVE");

            let running = true;
            while (running) {
                state.transition("EXECUTING");
                this.milestoneRepo.updateStatus(milestoneId, "EXECUTING");

                const openIssues = this.issueRepo.listOpenByMilestone(milestoneId);
                const issueContext = openIssues.length > 0 ? `\nOpen Issues to FIX:\n${openIssues.map(i => `- ${i.title}: ${i.description}`).join("\n")}` : "";

                console.log(`[ORCHESTRATOR] Phase: EXECUTION`);
                console.log(`[ARES] Creating worker schedule...`);
                
                const aresResult = await this.ares.invoke(`Schedule workers for this milestone: ${JSON.stringify(context.currentMilestone)}${issueContext}\nProvide workers to achieve this and fix the issues.`, context);
                if (!aresResult.success || !aresResult.data) throw new Error("Ares failed to create schedule");
                
                for (const workerSpec of aresResult.data.workers) {
                    console.log(`[WORKER:${workerSpec.role}] Starting task: ${workerSpec.task}`);
                    
                    let enrichedTask = workerSpec.task;
                    if (context.verificationFeedback) {
                        enrichedTask += `\n\nContext from previous failure:\nEvidence: ${context.verificationFeedback.evidence.join(", ")}\nRequired Fixes: ${context.verificationFeedback.requiredFixes.join(", ")}`;
                    }

                    const worker = this.workerFactory.createWorker(workerSpec.role, enrichedTask);
                    const workerResult = await worker.executeTask(context);
                    if (!workerResult.success) {
                        console.error(`[WORKER:${workerSpec.role}] Failed: ${workerResult.error}`);
                    }
                }

                state.transition("VERIFYING");
                this.milestoneRepo.updateStatus(milestoneId, "VERIFYING");
                console.log(`[ORCHESTRATOR] Phase: VERIFICATION`);
                console.log(`[APOLLO] Verifying milestone...`);
                
                const apolloResult = await this.apollo.invoke(`Verify if the milestone was completed. Milestone: ${JSON.stringify(context.currentMilestone)}`, context);
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
                    
                    openIssues.forEach(issue => this.issueRepo.updateStatus(issue.id, "VERIFIED"));
                    
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

                    let issueLimitReached = false;
                    for (const issue of openIssues) {
                        this.issueRepo.incrementFixAttempts(issue.id);
                        const updated = this.issueRepo.get(issue.id)!;
                        if (updated.fixAttempts >= MAX_FIX_ATTEMPTS_PER_ISSUE) {
                            issueLimitReached = true;
                            console.log(`[ORCHESTRATOR] Issue ${issue.id} reached MAX_FIX_ATTEMPTS_PER_ISSUE (${MAX_FIX_ATTEMPTS_PER_ISSUE}).`);
                        }
                    }

                    if (issueLimitReached) {
                        console.log(`[ORCHESTRATOR] Stopping safely due to issue fix attempt limits.`);
                        state.transition("FAILED");
                        this.milestoneRepo.updateStatus(milestoneId, "FAILED");
                        running = false;
                        break;
                    }

                    if (verification.requiredFixes) {
                        for (const fix of verification.requiredFixes) {
                            const exists = openIssues.some(i => i.title === fix);
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
                                    status: "OPEN",
                                    fixAttempts: 0
                                });
                            }
                        }
                    }

                    state.transition("FAILED");
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
