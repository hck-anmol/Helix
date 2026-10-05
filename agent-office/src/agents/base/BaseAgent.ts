import { AgentContext } from "./AgentContext";
import { AgentResult } from "./AgentResult";
import { ModelRouter } from "../../llm/ModelRouter";
import { AgentRunRepository } from "../../persistence/repositories/AgentRunRepository";
import { config } from "../../config/config";
import crypto from "crypto";

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
        const startTime = Date.now();

        try {
            const response = await this.router.route(this.role, {
                systemPrompt,
                prompt,
                responseFormat: "json"
            });

            const parsed = this.parseResponse(response.content);
            
            const duration = Date.now() - startTime;
            this.runRepo.create({
                id: runId,
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId || "",
                issueId: context.currentIssueId || "",
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
            return { success: true, data: parsed, rawOutput: response.content, runId };
        } catch (error: any) {
            console.error(`[AGENT:${this.role}] Error:`, error.message);
            this.runRepo.create({
                id: runId,
                projectId: context.projectId,
                milestoneId: context.currentMilestoneId || "",
                issueId: context.currentIssueId || "",
                agentId: this.id,
                role: this.role,
                model,
                task: "",
                phase: "EXECUTION",
                status: "FAILED",
                output: error.message,
                contextHash: context.contextHash,
                duration: Date.now() - startTime,
                error: error.message
            });
            return { success: false, error: error.message, runId };
        }
    }
}
