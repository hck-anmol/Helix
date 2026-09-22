export interface ToolContext {
    projectId: string;
    workspaceRoot: string;
}

export interface Tool {
    name: string;
    description: string;
    execute(args: any, context: ToolContext): Promise<string>;
}
