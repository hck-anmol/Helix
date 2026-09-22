import { Tool, ToolContext } from "./Tool";
import { exec } from "child_process";
import util from "util";
import path from "path";

const execAsync = util.promisify(exec);

export class ShellTool implements Tool {
    name = "execute_shell";
    description = "Executes a shell command. Args: { \"command\": \"...\" }";

    async execute(args: { command: string }, context: ToolContext): Promise<string> {
        try {
            const { stdout, stderr } = await execAsync(args.command, { cwd: context.workspaceRoot });
            return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        } catch (error: any) {
            return `ERROR: ${error.message}\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}`;
        }
    }
}
