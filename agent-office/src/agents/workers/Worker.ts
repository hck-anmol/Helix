import { BaseAgent } from "../base/BaseAgent";
import { AgentContext } from "../base/AgentContext";
import { AgentResult } from "../base/AgentResult";
import { ModelRouter } from "../../llm/ModelRouter";
import { AgentRunRepository } from "../../persistence/repositories/AgentRunRepository";
import { Tool } from "../../tools/Tool";
import { config } from "../../config/config";
import { isCppFile } from "../../utils/CppValidator";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { z } from "zod";
import { eventEmitter } from "../../observability/EventEmitter";

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

/**
 * Find all .cpp files in the workspace root (non-recursive top-level + src/).
 * Used for compilation so multi-file projects link correctly.
 */
function findAllCppFiles(workspaceRoot: string): string[] {
    const results: string[] = [];
    function walk(dir: string, depth: number) {
        if (depth > 3) return; // don't recurse too deep
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                if (e.isDirectory()) {
                    if (!["node_modules", ".git", "reports"].includes(e.name)) {
                        walk(path.join(dir, e.name), depth + 1);
                    }
                } else if (e.name.endsWith(".cpp") || e.name.endsWith(".cc") || e.name.endsWith(".cxx")) {
                    results.push(path.join(dir, e.name));
                }
            }
        } catch (_) {}
    }
    walk(workspaceRoot, 0);
    return results;
}

/** Try to compile all C++ files in the workspace with g++. Returns null if g++ not available. */
async function tryCppCompileAll(workspaceRoot: string): Promise<{ success: boolean; output: string; files: string[] } | null> {
    const cppFiles = findAllCppFiles(workspaceRoot);
    if (cppFiles.length === 0) return null;

    return new Promise((resolve) => {
        exec("g++ --version", (err) => {
            if (err) {
                resolve(null); // g++ not available, skip
                return;
            }
            const outBin = path.join(workspaceRoot, "_agent_office_build");
            const fileList = cppFiles.map(f => `"${f}"`).join(" ");
            const cmd = `g++ -std=c++14 -Wall ${fileList} -o "${outBin}"`;
            exec(cmd, { cwd: workspaceRoot, timeout: 30000 }, (compileErr, stdout, stderr) => {
                const output = ((stdout || "") + (stderr || "")).trim();
                if (compileErr && compileErr.code !== 0) {
                    resolve({ success: false, output, files: cppFiles });
                } else {
                    resolve({ success: true, output, files: cppFiles });
                }
            });
        });
    });
}

/** Run the compiled binary if it exists. */
async function runCompiledBinary(workspaceRoot: string): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
    // Try both with and without .exe
    for (const binName of ["_agent_office_build.exe", "_agent_office_build"]) {
        const bin = path.join(workspaceRoot, binName);
        if (fs.existsSync(bin)) {
            return new Promise((resolve) => {
                exec(`"${bin}"`, { cwd: workspaceRoot, timeout: 15000 }, (err, stdout, stderr) => {
                    resolve({ exitCode: err?.code ?? 0, stdout: stdout || "", stderr: stderr || "" });
                });
            });
        }
    }
    return null;
}

export class Worker extends BaseAgent<WorkerOutput> {
    private skillInstruction: string;

    constructor(
        role: keyof typeof config.models,
        private contract: any,
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

${context.historicalContext ? context.historicalContext + '\n\n' : ''}You are working on this task:
Objective:\n${this.contract.objective}\n\nAcceptance Criteria:\n${this.contract.acceptanceCriteria.join("\n")}\n\nConstraints:\n${this.contract.constraints.join("\n")}

You can request to execute tools by providing them in your JSON output.
If you are a tester, determine the appropriate test command (e.g. \`g++ -std=c++14 *.cpp -o test && ./test\` for C++, or \`npm test\` for Node.js).

    Output strictly JSON matching this schema. Return ONLY valid JSON. No markdown fences. Ensure arrays and objects are properly closed.
    IMPORTANT: For multi-line strings (like file contents), use standard JSON escaped newlines.
    CRITICAL for C/C++ files: Do NOT open or add to namespace std. Use your own namespace or no namespace.
    CRITICAL: Each write_file call must contain the COMPLETE file. Never truncate. Always close all braces and brackets.
    CRITICAL: Use correct C++ syntax - use :: for scope resolution (std::cout), not comma (std,cout).
    {
  "status": "COMPLETED" or "FAILED",
  "summary": "Brief summary of work done",
  "message": "Description of what was done",
  "filesChanged": ["<path_derived_from_task>"],
  "errors": [],
  "warnings": [],
  "toolCalls": [
     { "tool": "write_file", "args": { "path": "<path_derived_from_task>", "content": "..." } },
     { "tool": "execute_shell", "args": { "command": "<test_command>" } }
  ]
}`;
    }

    parseResponse(response: string): WorkerOutput {
        try {
            const startIdx = response.indexOf('{');
            const endIdx = response.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1) {
                throw new Error("No JSON object found in response");
            }
            const jsonStr = response.substring(startIdx, endIdx + 1);
            const parsed = JSON.parse(jsonStr);
            return WorkerOutputSchema.parse(parsed);
        } catch (error) {
            throw new Error(`Worker output validation failed: ${error}`);
        }
    }

    async executeTask(context: AgentContext): Promise<AgentResult<WorkerOutput>> {
        // ── Deterministic Demo Path for Dijkstra scaffold ────────────────────
        if (this.contract.objective.toLowerCase().includes("copy_template")) {
            return this._executeDijkstraDemoTask(context);
        }

        let result: AgentResult<WorkerOutput> | undefined;
        let lastError: string | undefined;

        // Up to 3 attempts covering: JSON schema + tool execution + C++ compilation
        for (let attempt = 1; attempt <= 3; attempt++) {
            let prompt = this.contract.objective;
            if (attempt > 1) {
                prompt += `\n\nCRITICAL: Your previous attempt failed with this error:\n${lastError}\n\nYou MUST fix these specific errors. Return ONLY valid JSON. Do NOT wrap in markdown fences. Ensure all arrays/objects are closed. For C++: use :: for scope resolution, correct function call syntax, complete files only.`;
            }

            result = await this.invoke(prompt, context);
            if (!result.success || !result.data) {
                lastError = result.error;
                console.warn(`[WORKER:${this.role}] Attempt ${attempt} failed: ${lastError}`);
                continue; // retry JSON parsing
            }

            // JSON schema OK — now execute tools
            result.data.testsRun = result.data.testsRun || [];
            let toolValidationError: string | undefined;
            const writtenCppFiles: string[] = [];

            if (result.data.toolCalls) {
                for (const call of result.data.toolCalls) {
                    const tool = this.tools.find(t => t.name === call.tool);
                    if (!tool) continue;

                    console.log(`[WORKER:${this.role}] Executing tool ${tool.name}...`);
                    eventEmitter.emit({
                        projectId: context.projectId,
                        milestoneId: context.currentMilestoneId,
                        issueId: context.currentIssueId,
                        contractId: (context as any).currentContractId,
                        agentRunId: result.runId,
                        eventType: "TOOL_STARTED",
                        role: this.role,
                        message: `Executing tool ${tool.name}`,
                        metadata: { toolName: tool.name, args: call.args }
                    });
                    const start = Date.now();
                    try {
                        const toolResult = await tool.execute(call.args, { projectId: context.projectId, workspaceRoot: context.workspaceRoot });
                        const durationMs = Date.now() - start;

                        eventEmitter.emit({
                            projectId: context.projectId,
                            milestoneId: context.currentMilestoneId,
                            issueId: context.currentIssueId,
                            contractId: (context as any).currentContractId,
                            agentRunId: result.runId,
                            eventType: "TOOL_COMPLETED",
                            role: this.role,
                            durationMs,
                            status: "SUCCESS",
                            metadata: { toolName: tool.name }
                        });

                        if (tool.name === "write_file" && call.args?.path && isCppFile(call.args.path)) {
                            writtenCppFiles.push(call.args.path);
                        }

                        if (tool.name === "execute_shell") {
                            const isTestOrBuildCommand = call.args.command.includes("test") ||
                                call.args.command.includes("node") ||
                                call.args.command.includes("./") ||
                                call.args.command.includes("g++");
                            if (isTestOrBuildCommand) {
                                const sr = toolResult as any;
                                result.data.testsRun!.push({
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
                    } catch (error: any) {
                        const durationMs = Date.now() - start;
                        eventEmitter.emit({
                            projectId: context.projectId,
                            milestoneId: context.currentMilestoneId,
                            issueId: context.currentIssueId,
                            contractId: (context as any).currentContractId,
                            agentRunId: result.runId,
                            eventType: "TOOL_FAILED",
                            role: this.role,
                            durationMs,
                            status: "FAILED",
                            message: error.message,
                            metadata: { toolName: tool.name }
                        });
                        if (tool.name === "write_file" && error.message.includes("C++ validation failed")) {
                            toolValidationError = error.message;
                            console.error(`[WORKER:${this.role}] C++ validation rejected: ${error.message}`);
                        }
                    }
                }
            }

            // If C++ file validation rejected a file, retry with that error
            if (toolValidationError) {
                lastError = `C++ file validation failed: ${toolValidationError}`;
                console.warn(`[WORKER:${this.role}] Attempt ${attempt} C++ validation error — retrying`);
                continue;
            }

            // Post-write: compile ALL C++ files in the workspace together
            if (this.role === "developer" && writtenCppFiles.length > 0) {
                console.log(`[WORKER:developer] Attempting C++ compilation (all workspace files)...`);
                const compileResult = await tryCppCompileAll(context.workspaceRoot);

                if (compileResult !== null) {
                    if (!compileResult.success) {
                        // Trim error to avoid token overflow; keep first ~2000 chars
                        const trimmedError = compileResult.output.substring(0, 2000);
                        lastError = `C++ compilation failed. You must fix the exact errors shown below:\n${trimmedError}`;
                        console.error(`[WORKER:developer] Attempt ${attempt} compile FAILED — retrying with error`);
                        // Clean up partial artifacts so next attempt writes fresh files
                        for (const f of writtenCppFiles) {
                            try {
                                const fullPath = path.join(context.workspaceRoot, f);
                                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
                            } catch (_) {}
                        }
                        continue; // retry with compile error in prompt
                    } else {
                        console.log(`[WORKER:developer] C++ compilation PASSED (${compileResult.files.length} files)`);
                        // Run the compiled binary tests
                        const testRun = await runCompiledBinary(context.workspaceRoot);
                        if (testRun) {
                            result.data.testsRun!.push({
                                command: "_agent_office_build",
                                status: testRun.exitCode === 0 ? "PASSED" : "FAILED",
                                exitCode: testRun.exitCode,
                                stdout: testRun.stdout,
                                stderr: testRun.stderr,
                                durationMs: 0
                            });
                            if (testRun.exitCode !== 0) {
                                console.error(`[WORKER:developer] Binary tests FAILED: ${testRun.stderr}`);
                            } else {
                                console.log(`[WORKER:developer] Binary tests PASSED: ${testRun.stdout.substring(0, 200)}`);
                            }
                        }
                    }
                }
            }

            // All checks passed for this attempt
            this.runRepo.updateOutput(result.runId!, JSON.stringify(result.data));
            return result;
        }

        // All 3 attempts exhausted
        return result || { success: false, error: lastError || "Failed after 3 attempts", runId: undefined };
    }

    /** Deterministic execution path for Dijkstra demo — no LLM involved. */
    private async _executeDijkstraDemoTask(context: AgentContext): Promise<AgentResult<WorkerOutput>> {
        const runId = crypto.randomUUID();
        const workspaceRoot = context.workspaceRoot;

        // Persist an agent_run row so FK constraints from artifact_changes / test_results are satisfied
        this.runRepo.create({
            id: runId,
            projectId: context.projectId,
            milestoneId: context.currentMilestoneId || "",
            issueId: context.currentIssueId || "",
            contractId: (context as any).currentContractId || "",
            agentId: this.id,
            role: this.role,
            model: "deterministic-scaffold",
            task: "dijkstra-demo",
            phase: "EXECUTION",
            status: "SUCCESS",
            output: "",
            duration: 0
        });

        // 1. Copy the template into the workspace
        const copyTool = this.tools.find(t => t.name === "copy_template");
        if (!copyTool) {
            return { success: false, error: "copy_template tool not registered", runId };
        }

        try {
            await copyTool.execute({ templateName: "dijkstra" }, { projectId: context.projectId, workspaceRoot });
            console.log("[WORKER:developer] Dijkstra template copied into workspace.");
        } catch (err: any) {
            return { success: false, error: `copy_template failed: ${err.message}`, runId };
        }

        // 2. Compile all C++ files
        const outDir = path.join(workspaceRoot, "build");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const compileResult = await new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
            const cmd = `g++ -std=c++17 -I. src/graph.cpp src/dijkstra.cpp tests/test_dijkstra.cpp -o build/dijkstra`;
            exec(cmd, { cwd: workspaceRoot, timeout: 30000 }, (err, stdout, stderr) => {
                resolve({ success: !err, stdout: stdout || "", stderr: stderr || "", exitCode: err?.code ?? 0 });
            });
        });

        if (!compileResult.success) {
            return {
                success: false,
                error: `Compilation failed:\n${compileResult.stderr}`,
                runId,
                data: {
                    status: "FAILED",
                    message: `g++ compilation failed: ${compileResult.stderr.substring(0, 500)}`,
                    testsRun: [{
                        command: "g++ -std=c++17 src/graph.cpp src/dijkstra.cpp tests/test_dijkstra.cpp -o build/dijkstra",
                        status: "FAILED",
                        exitCode: compileResult.exitCode,
                        stdout: compileResult.stdout,
                        stderr: compileResult.stderr,
                        durationMs: 0
                    }]
                }
            };
        }

        console.log("[WORKER:developer] Dijkstra compiled successfully.");

        // 3. Run the compiled tests
        const dijkstraBin = path.join(workspaceRoot, "build", process.platform === "win32" ? "dijkstra.exe" : "dijkstra");
        const dijkstraBinAlt = path.join(workspaceRoot, "build", "dijkstra");
        const binPath = fs.existsSync(dijkstraBin) ? dijkstraBin : dijkstraBinAlt;

        const testResult = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
            exec(`"${binPath}"`, { cwd: workspaceRoot, timeout: 15000 }, (err, stdout, stderr) => {
                resolve({ exitCode: err?.code ?? 0, stdout: stdout || "", stderr: stderr || "" });
            });
        });

        const testPassed = testResult.exitCode === 0;
        console.log(`[WORKER:developer] Dijkstra tests ${testPassed ? "PASSED" : "FAILED"}: ${testResult.stdout.substring(0, 200)}`);

        return {
            success: testPassed,
            error: testPassed ? undefined : `Tests failed (exit ${testResult.exitCode}): ${testResult.stderr}`,
            runId,
            data: {
                status: testPassed ? "COMPLETED" : "FAILED",
                summary: "Dijkstra implementation built and tested via demo scaffold",
                message: testPassed
                    ? `All Dijkstra tests passed. Output:\n${testResult.stdout.substring(0, 500)}`
                    : `Dijkstra tests failed (exit ${testResult.exitCode}):\n${testResult.stderr.substring(0, 500)}`,
                filesChanged: ["src/graph.h", "src/graph.cpp", "src/dijkstra.cpp", "tests/test_dijkstra.cpp"],
                testsRun: [
                    {
                        command: "g++ -std=c++17 -I. src/graph.cpp src/dijkstra.cpp tests/test_dijkstra.cpp -o build/dijkstra",
                        status: "PASSED",
                        exitCode: 0,
                        stdout: compileResult.stdout,
                        stderr: compileResult.stderr,
                        durationMs: 0
                    },
                    {
                        command: binPath,
                        status: testPassed ? "PASSED" : "FAILED",
                        exitCode: testResult.exitCode,
                        stdout: testResult.stdout,
                        stderr: testResult.stderr,
                        durationMs: 0
                    }
                ]
            }
        };
    }
}
