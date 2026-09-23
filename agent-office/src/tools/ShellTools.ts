import { Tool, ToolContext } from "./Tool";
import { exec } from "child_process";
import path from "path";

export interface ShellResult {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
}

export class ShellTool implements Tool {
    name = "execute_shell";
    description = "Executes a shell command. Args: { \"command\": \"...\" }";

    async execute(args: { command: string }, context: ToolContext): Promise<ShellResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            // 15 seconds timeout
            const child = exec(args.command, { cwd: context.workspaceRoot, timeout: 15000 }, (error, stdout, stderr) => {
                const durationMs = Date.now() - startTime;
                resolve({
                    command: args.command,
                    stdout: stdout || "",
                    stderr: stderr || "",
                    exitCode: error?.code ?? 0,
                    durationMs
                });
            });
        });
    }
}
