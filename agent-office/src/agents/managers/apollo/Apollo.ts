import { BaseAgent } from "../../base/BaseAgent";
import { AgentContext } from "../../base/AgentContext";
import { ApolloOutput, ApolloOutputSchema } from "./schema";
import { APOLLO_SYSTEM_PROMPT } from "./prompt";
import { ModelRouter } from "../../../llm/ModelRouter";
import { AgentRunRepository } from "../../../persistence/repositories/AgentRunRepository";
import crypto from "crypto";

export class Apollo extends BaseAgent<ApolloOutput> {
    constructor(router: ModelRouter, runRepo: AgentRunRepository) {
        super(crypto.randomUUID(), "apollo", router, runRepo);
    }

    getSystemPrompt(context: AgentContext): string {
        return APOLLO_SYSTEM_PROMPT;
    }

    parseResponse(response: string): ApolloOutput {
        try {
            const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return ApolloOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Apollo output validation failed: ${error}`);
        }
    }
}
