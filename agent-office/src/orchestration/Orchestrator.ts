import { StateMachine } from "./StateMachine";
import { Athena } from "../agents/managers/athena/Athena";
import { Ares } from "../agents/managers/ares/Ares";
import { Apollo } from "../agents/managers/apollo/Apollo";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { AgentContext } from "../agents/base/AgentContext";
import { config } from "../config/config";
import crypto from "crypto";

export class Orchestrator {
    private state: StateMachine;
    
    constructor(
        private athena: Athena,
        private ares: Ares,
        private apollo: Apollo,
        private workerFactory: WorkerFactory,
        private projectRepo: ProjectRepository,
        private milestoneRepo: MilestoneRepository
    ) {
        this.state = new StateMachine();
    }

    async runProject(projectId: string) {
        const project = this.projectRepo.get(projectId);
        if (!project) throw new Error("Project not found");

        const context: AgentContext = {
            projectId,
            workspaceRoot: require("path").join(config.workspaceRoot, projectId),
            projectSpec: project.specification
        };

        console.log(`[ORCHESTRATOR] Starting project: ${project.name}`);
        this.state.transition("STRATEGY");

        let cycleCount = 0;
        const MAX_CYCLES = 5;

        while (this.state.phase !== "COMPLETED" && this.state.phase !== "FAILED" && cycleCount < MAX_CYCLES) {
            cycleCount++;
            
            try {
                if (this.state.phase === "STRATEGY") {
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
                        status: "PENDING",
                        budget: milestoneData.budget
                    });

                    context.currentMilestone = milestoneData;
                    this.state.transition("EXECUTION");
                } 
                
                else if (this.state.phase === "EXECUTION") {
                    console.log(`[ORCHESTRATOR] Phase: EXECUTION`);
                    console.log(`[ARES] Creating worker schedule...`);
                    
                    const aresResult = await this.ares.invoke(`Schedule workers for this milestone: ${JSON.stringify(context.currentMilestone)}`, context);
                    if (!aresResult.success || !aresResult.data) throw new Error("Ares failed to create schedule");
                    
                    const schedule = aresResult.data;
                    
                    for (const workerSpec of schedule.workers) {
                        console.log(`[WORKER:${workerSpec.role}] Starting task: ${workerSpec.task}`);
                        const worker = this.workerFactory.createWorker(workerSpec.role, workerSpec.task);
                        const workerResult = await worker.executeTask(context);
                        if (!workerResult.success) {
                            console.error(`[WORKER:${workerSpec.role}] Failed.`);
                        }
                    }

                    this.state.transition("VERIFICATION");
                } 
                
                else if (this.state.phase === "VERIFICATION") {
                    console.log(`[ORCHESTRATOR] Phase: VERIFICATION`);
                    console.log(`[APOLLO] Verifying milestone...`);
                    
                    const apolloResult = await this.apollo.invoke(`Verify if the milestone was completed. Milestone: ${JSON.stringify(context.currentMilestone)}`, context);
                    if (!apolloResult.success || !apolloResult.data) throw new Error("Apollo failed to verify");

                    const verification = apolloResult.data;
                    if (verification.status === "PASS") {
                        console.log(`[APOLLO] PASS`);
                        this.state.transition("COMPLETED"); // End demo after 1 milestone
                    } else {
                        console.log(`[APOLLO] FAIL. Required fixes: ${verification.requiredFixes?.join(", ")}`);
                        context.verificationFeedback = verification;
                        this.state.transition("EXECUTION"); // loop back to fix
                    }
                }
            } catch (error: any) {
                console.error(`[ORCHESTRATOR] Error in phase ${this.state.phase}:`, error.message);
                this.state.transition("FAILED");
            }
        }
        
        console.log(`[ORCHESTRATOR] Project ended with state: ${this.state.phase}`);
    }
}
