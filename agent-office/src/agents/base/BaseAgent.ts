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
        
        console.log(`[AGENT:${this.role}] Starting...`);
        const startTime = Date.now();

        try {
            const response = await this.router.route(this.role, {
                systemPrompt,
                prompt,
                responseFormat: "json"
            });

            const parsed = this.parseResponse(response.content);
            
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
                output: JSON.stringify(parsed)
            });

            console.log(`[AGENT:${this.role}] Completed in ${Date.now() - startTime}ms.`);
            return { success: true, data: parsed, rawOutput: response.content };
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
                output: error.message
            });
            return { success: false, error: error.message };
        }
    }
}
