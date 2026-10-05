import { AgentContext } from "./AgentContext";
import { AgentResult } from "./AgentResult";
import { ModelRouter } from "../../llm/ModelRouter";
import { AgentRunRepository } from "../../persistence/repositories/AgentRunRepository";
import { config } from "../../config/config";
import crypto from "crypto";
import { eventEmitter } from "../../observability/EventEmitter";

export abstract class BaseAgent<T = any> {
    protected constructor(
        public readonly id: string,
        public readonly role: keyof typeof config.models,
        protected readonly router: ModelRouter,
        protected readonly runRepo: AgentRunRepository
    ) {}

    abstract getSystemPrompt(context: AgentContext): string;
    abstract parseResponse(response: string): T;

    async invoke(prompt: string, context: AgentContext): Promise<AgentResult<T>> {
        const runId = crypto.randomUUID();
        const model = config.models[this.role];
        const systemPrompt = this.getSystemPrompt(context);
        
        console.log(`[AGENT:${this.role}] Starting (MODEL USED: ${model})...`);
        eventEmitter.emit({
            projectId: context.projectId,
            milestoneId: context.currentMilestoneId,
            issueId: context.currentIssueId,
            contractId: (context as any).currentContractId,
            agentRunId: runId,
            eventType: "AGENT_STARTED",
            role: this.role,
            model,
            metadata: { contextHash: context.contextHash }
        });

        const startTime = Date.now();

        try {
            const response = await this.router.route(this.role, {
                systemPrompt,
                prompt,
                responseFormat: "json",
                context: {
                    projectId: context.projectId,
                    milestoneId: context.currentMilestoneId,
                    issueId: context.currentIssueId,
                    contractId: (context as any).currentContractId,
                    agentRunId: runId
                }
            });

            const parsed = this.parseResponse(response.content);
            
            const duration = Date.now() - startTime;
            this.runRepo.create({
                id: runId,
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId || "",
                issueId: context.currentIssueId || "",
                contractId: (context as any).currentContractId || "",
                agentId: this.id,
                role: this.role,
                model,
                task: "",
                phase: "EXECUTION",
                status: "SUCCESS",
                output: JSON.stringify(parsed),
                contextHash: context.contextHash,
                duration: duration
            });

            console.log(`[AGENT:${this.role}] Completed in ${duration}ms.`);
            eventEmitter.emit({
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId,
                issueId: context.currentIssueId,
                contractId: (context as any).currentContractId,
                agentRunId: runId,
                eventType: "AGENT_COMPLETED",
                role: this.role,
                model,
                durationMs: duration,
                status: "SUCCESS"
            });
            return { success: true, data: parsed, rawOutput: response.content, runId };
        } catch (error: any) {
            console.error(`[AGENT:${this.role}] Error:`, error.message);
            const duration = Date.now() - startTime;
            this.runRepo.create({
                id: runId,
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId || "",
                issueId: context.currentIssueId || "",
                contractId: (context as any).currentContractId || "",
                agentId: this.id,
                role: this.role,
                model,
                task: "",
                phase: "EXECUTION",
                status: "FAILED",
                output: error.message,
                contextHash: context.contextHash,
                duration: duration,
                error: error.message
            });
            eventEmitter.emit({
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId,
                issueId: context.currentIssueId,
                contractId: (context as any).currentContractId,
                agentRunId: runId,
                eventType: "AGENT_FAILED",
                role: this.role,
                model,
                durationMs: duration,
                status: "FAILED",
                message: error.message
            });
            return { success: false, error: error.message, runId };
        }
    }
}
