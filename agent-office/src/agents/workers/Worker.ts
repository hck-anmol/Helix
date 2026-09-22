import { BaseAgent } from "../base/BaseAgent";
import { AgentContext } from "../base/AgentContext";
import { AgentResult } from "../base/AgentResult";
import { ModelRouter } from "../../llm/ModelRouter";
import { AgentRunRepository } from "../../persistence/repositories/AgentRunRepository";
import { Tool } from "../../tools/Tool";
import { config } from "../../config/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { z } from "zod";

const WorkerOutputSchema = z.object({
    status: z.enum(["COMPLETED", "FAILED"]),
    message: z.string(),
    toolCalls: z.array(z.object({
        tool: z.string(),
        args: z.any()
    })).optional()
});

export type WorkerOutput = z.infer<typeof WorkerOutputSchema>;

export class Worker extends BaseAgent<WorkerOutput> {
    private skillInstruction: string;

    constructor(
        role: keyof typeof config.models,
        private taskDescription: string,
        private tools: Tool[],
        router: ModelRouter,
        runRepo: AgentRunRepository
    ) {
        super(crypto.randomUUID(), role, router, runRepo);
        const skillPath = path.join(__dirname, "skills", `${role}.md`);
        this.skillInstruction = fs.readFileSync(skillPath, "utf-8");
    }

    getSystemPrompt(context: AgentContext): string {
        const toolDescriptions = this.tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
        return `You are a worker with the role: ${this.role}.
Your instructions:
${this.skillInstruction}

You have access to the following tools:
${toolDescriptions}

You are working on this task:
${this.taskDescription}

You can request to execute tools by providing them in your JSON output. If you need to run tools, set status to "COMPLETED" (for this step) and list the tools. The orchestrator will not loop you automatically in this prototype, so you should output the direct result or code if you can, or list the tools you would use.

Actually, for this prototype phase, your task is simple enough that you must use your tools in a single response.
Output strictly JSON matching this schema:
{
  "status": "COMPLETED" or "FAILED",
  "message": "Description of what was done",
  "toolCalls": [
     { "tool": "write_file", "args": { "path": "app.js", "content": "..." } },
     { "tool": "execute_shell", "args": { "command": "npm test" } }
  ]
}`;
    }

    parseResponse(response: string): WorkerOutput {
        try {
            const cleaned = response.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            return WorkerOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Worker output validation failed: ${error}`);
        }
    }

    async executeTask(context: AgentContext): Promise<AgentResult<WorkerOutput>> {
        const result = await this.invoke(this.taskDescription, context);
        if (result.success && result.data?.toolCalls) {
            for (const call of result.data.toolCalls) {
                const tool = this.tools.find(t => t.name === call.tool);
                if (tool) {
                    console.log(`[WORKER:${this.role}] Executing tool ${tool.name}...`);
                    const toolResult = await tool.execute(call.args, { projectId: context.projectId, workspaceRoot: context.workspaceRoot });
                    console.log(`[WORKER:${this.role}] Tool result: ${toolResult.substring(0, 100)}...`);
                }
            }
        }
        return result;
    }
}
