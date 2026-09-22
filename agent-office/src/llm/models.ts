export interface ModelRequest {
    systemPrompt: string;
    prompt: string;
    responseFormat?: "json"; // for structured output
}

export interface ModelResponse {
    content: string;
    model: string;
    durationMs?: number;
}
