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
    summary: z.string().optional(),
    message: z.string(),
    filesChanged: z.array(z.string()).optional(),
    errors: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
    toolCalls: z.array(z.object({
        tool: z.string(),
        args: z.any()
    })).optional(),
    testsRun: z.array(z.object({
        command: z.string(),
        status: z.enum(["PASSED", "FAILED", "ERROR", "SKIPPED"]),
        exitCode: z.number(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        durationMs: z.number().optional()
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

You can request to execute tools by providing them in your JSON output.
If you are a tester, determine the appropriate test command (e.g. \`npm test\` or \`node <test-file>\`).

Output strictly JSON matching this schema:
{
  "status": "COMPLETED" or "FAILED",
  "summary": "Brief summary of work done",
  "message": "Description of what was done",
  "filesChanged": ["app.js"],
  "errors": [],
  "warnings": [],
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
        if (result.success && result.data) {
            result.data.testsRun = result.data.testsRun || [];
            
            if (result.data.toolCalls) {
                for (const call of result.data.toolCalls) {
                    const tool = this.tools.find(t => t.name === call.tool);
                    if (tool) {
                        console.log(`[WORKER:${this.role}] Executing tool ${tool.name}...`);
                        const toolResult = await tool.execute(call.args, { projectId: context.projectId, workspaceRoot: context.workspaceRoot });
                        
                        if (tool.name === "execute_shell") {
                            const isTestCommand = call.args.command.includes("test") || call.args.command.includes("node");
                            if (isTestCommand) {
                                const sr = toolResult as any;
                                result.data.testsRun.push({
                                    command: sr.command,
                                    status: sr.exitCode === 0 ? "PASSED" : "FAILED",
                                    exitCode: sr.exitCode,
                                    stdout: sr.stdout,
                                    stderr: sr.stderr,
                                    durationMs: sr.durationMs
                                });
                            }
                        } else {
                            console.log(`[WORKER:${this.role}] Tool result: ${String(toolResult).substring(0, 100)}...`);
                        }
                    }
                }
            }

            // Update AgentRun output in DB so we can query testsRun later
            this.runRepo.updateOutput(this.id, JSON.stringify(result.data));
        }
        return result;
    }
}
