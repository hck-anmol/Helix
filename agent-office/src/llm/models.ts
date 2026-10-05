export interface ModelRequest {
    systemPrompt: string;
    prompt: string;
    responseFormat?: "json"; // for structured output
    context?: {
        projectId: string;
        milestoneId?: string;
        issueId?: string;
        contractId?: string;
        agentRunId?: string;
    };
}

export interface ModelResponse {
    content: string;
    model: string;
    durationMs?: number;
}
