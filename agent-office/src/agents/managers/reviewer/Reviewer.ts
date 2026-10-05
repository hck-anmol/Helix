import { BaseAgent } from "../../base/BaseAgent";
import { AgentContext } from "../../base/AgentContext";
import { ReviewerOutput, ReviewerOutputSchema } from "./schema";
import { REVIEWER_SYSTEM_PROMPT } from "./prompt";
import { ModelRouter } from "../../../llm/ModelRouter";
import { AgentRunRepository } from "../../../persistence/repositories/AgentRunRepository";
import crypto from "crypto";

export class Reviewer extends BaseAgent<ReviewerOutput> {
    constructor(router: ModelRouter, runRepo: AgentRunRepository) {
        super(crypto.randomUUID(), "reviewer", router, runRepo);
    }

    getSystemPrompt(context: AgentContext): string {
        const strictEnforcement = `\n\nCRITICAL: Your output MUST strictly match the Reviewer JSON schema exactly. You must output a 'status' of either "PASS" or "FAIL". Do NOT output "COMPLETED".`;
        return context.historicalContext ? `${REVIEWER_SYSTEM_PROMPT}\n\n${context.historicalContext}${strictEnforcement}` : REVIEWER_SYSTEM_PROMPT + strictEnforcement;
    }

    parseResponse(response: string): ReviewerOutput {
        try {
            const startIdx = response.indexOf('{');
            const endIdx = response.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1) {
                throw new Error("No JSON object found in response");
            }
            const jsonStr = response.substring(startIdx, endIdx + 1);
            const parsed = JSON.parse(jsonStr);
            return ReviewerOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Reviewer output validation failed: ${error}`);
        }
    }
}
