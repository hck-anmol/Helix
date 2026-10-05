export interface AgentContext {
    projectId: string;
    workspaceRoot: string;
    historicalContext?: string;
    contextHash?: string;
    [key: string]: any;
}
