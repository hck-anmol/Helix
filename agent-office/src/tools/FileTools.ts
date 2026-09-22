import { Tool, ToolContext } from "./Tool";
import fs from "fs";
import path from "path";

function getSafePath(workspaceRoot: string, targetPath: string): string {
    const resolved = path.resolve(workspaceRoot, targetPath);
    if (!resolved.startsWith(workspaceRoot)) {
        throw new Error("Path traversal blocked");
    }
    return resolved;
}

export class ReadFileTool implements Tool {
    name = "read_file";
    description = "Reads the content of a file in the project. Args: { \"path\": \"relative/path\" }";

    async execute(args: { path: string }, context: ToolContext): Promise<string> {
        const fullPath = getSafePath(context.workspaceRoot, args.path);
        if (!fs.existsSync(fullPath)) return "File not found.";
        return fs.readFileSync(fullPath, "utf-8");
    }
}

export class WriteFileTool implements Tool {
    name = "write_file";
    description = "Writes content to a file in the project. Args: { \"path\": \"relative/path\", \"content\": \"...\" }";

    async execute(args: { path: string; content: string }, context: ToolContext): Promise<string> {
        const fullPath = getSafePath(context.workspaceRoot, args.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, args.content, "utf-8");
        return `Successfully wrote to ${args.path}`;
    }
}

export class ListFilesTool implements Tool {
    name = "list_files";
    description = "Lists files in a directory. Args: { \"path\": \"relative/dir\" }";

    async execute(args: { path: string }, context: ToolContext): Promise<string> {
        const fullPath = getSafePath(context.workspaceRoot, args.path || ".");
        if (!fs.existsSync(fullPath)) return "Directory not found.";
        const files = fs.readdirSync(fullPath);
        return files.join("\\n");
    }
}
