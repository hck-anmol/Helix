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
        return REVIEWER_SYSTEM_PROMPT;
    }

    parseResponse(response: string): ReviewerOutput {
        try {
            const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return ReviewerOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Reviewer output validation failed: ${error}`);
        }
    }
}
