import { BaseAgent } from "../../base/BaseAgent";
import { AgentContext } from "../../base/AgentContext";
import { AthenaOutput, AthenaOutputSchema } from "./schema";
import { ATHENA_SYSTEM_PROMPT } from "./prompt";
import { ModelRouter } from "../../../llm/ModelRouter";
import { AgentRunRepository } from "../../../persistence/repositories/AgentRunRepository";
import crypto from "crypto";

export class Athena extends BaseAgent<AthenaOutput> {
    constructor(router: ModelRouter, runRepo: AgentRunRepository) {
        super(crypto.randomUUID(), "athena", router, runRepo);
    }

    getSystemPrompt(context: AgentContext): string {
        return ATHENA_SYSTEM_PROMPT;
    }

    parseResponse(response: string): AthenaOutput {
        try {
            // Remove markdown code blocks if any
            const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return AthenaOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Athena output validation failed: ${error}`);
        }
    }
}
