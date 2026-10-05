import { Tool, ToolContext } from "./Tool";
import fs from "fs";
import path from "path";
import { stripMarkdownFences, validateCppContent, isCppFile } from "../utils/CppValidator";

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

        let content = args.content;

        // Strip markdown fences for all source files
        const strippedContent = stripMarkdownFences(content);
        if (strippedContent !== content) {
            console.log(`[WriteFileTool] Stripped markdown fences from ${args.path}`);
            content = strippedContent;
        }

        // Validate C/C++ source files before writing
        if (isCppFile(args.path)) {
            const validation = validateCppContent(content, args.path);
            if (!validation.valid) {
                const errorMessages = validation.errors.map(e => `[${e.type}] ${e.message}`).join("\n");
                throw new Error(`C++ validation failed for ${args.path}:\n${errorMessages}`);
            }
        }

        fs.writeFileSync(fullPath, content, "utf-8");
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
        return files.join("\n");
    }
}

export class CopyTemplateTool implements Tool {
    name = "copy_template";
    description = "Copies a demo template project into the current workspace. Args: { \"templateName\": \"dijkstra\" }";

    async execute(args: { templateName: string }, context: ToolContext): Promise<string> {
        // demo-templates/ lives two levels above the per-project workspace (projects/<id>/)
        const templatePath = path.resolve(context.workspaceRoot, "../../demo-templates", args.templateName);
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template '${args.templateName}' not found at ${templatePath}`);
        }

        const copyRecursiveSync = (src: string, dest: string) => {
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
                for (const child of fs.readdirSync(src)) {
                    copyRecursiveSync(path.join(src, child), path.join(dest, child));
                }
            } else {
                fs.copyFileSync(src, dest);
            }
        };

        copyRecursiveSync(templatePath, context.workspaceRoot);
        return `Template '${args.templateName}' copied successfully into workspace. Files are now in: src/, tests/`;
    }
}
