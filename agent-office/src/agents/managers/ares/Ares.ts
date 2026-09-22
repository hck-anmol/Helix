import { BaseAgent } from "../../base/BaseAgent";
import { AgentContext } from "../../base/AgentContext";
import { AresOutput, AresOutputSchema } from "./schema";
import { ARES_SYSTEM_PROMPT } from "./prompt";
import { ModelRouter } from "../../../llm/ModelRouter";
import { AgentRunRepository } from "../../../persistence/repositories/AgentRunRepository";
import crypto from "crypto";

export class Ares extends BaseAgent<AresOutput> {
    constructor(router: ModelRouter, runRepo: AgentRunRepository) {
        super(crypto.randomUUID(), "ares", router, runRepo);
    }

    getSystemPrompt(context: AgentContext): string {
        return ARES_SYSTEM_PROMPT;
    }

    parseResponse(response: string): AresOutput {
        try {
            const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return AresOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Ares output validation failed: ${error}`);
        }
    }
}
