import { ModelProvider } from "./ModelProvider";
import { ModelRequest, ModelResponse } from "./models";

export class OllamaProvider implements ModelProvider {
    constructor(private readonly baseUrl: string) {}

    async generate(modelId: string, request: ModelRequest): Promise<ModelResponse> {
        const start = Date.now();
        
        const payload: any = {
            model: modelId,
            system: request.systemPrompt,
            prompt: request.prompt,
            stream: false
        };

        if (request.responseFormat === "json") {
            payload.format = "json";
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json();
            
            return {
                content: data.response,
                model: data.model,
                durationMs: Date.now() - start
            };
        } catch (error) {
            console.warn(`[OllamaProvider] Failed to reach Ollama at ${this.baseUrl}. Using mock response for demo.`);
            // Mock responses for the demo if Ollama is offline
            let mockContent = "";
            if (modelId === "qwen3:8b" && request.systemPrompt.includes("You are Athena")) {
                mockContent = JSON.stringify({ type: "MILESTONE", title: "API Setup", description: "Setup REST API with health check", acceptanceCriteria: ["Returns 200 on /health"], budget: 3 });
            } else if (modelId === "qwen3:8b" && request.systemPrompt.includes("You are Ares")) {
                mockContent = JSON.stringify({ type: "SCHEDULE", workers: [{ role: "developer", task: "Write index.js" }, { role: "tester", task: "Write test.js" }] });
            } else if (modelId === "qwen3:8b" && request.systemPrompt.includes("You are Apollo")) {
                mockContent = JSON.stringify({ type: "VERIFICATION", status: "PASS", evidence: ["Tests passed"], failures: [], requiredFixes: [] });
            } else if (modelId === "qwen2.5-coder:7b" && request.systemPrompt.includes("developer")) {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Code written", toolCalls: [{ tool: "write_file", args: { path: "index.js", content: "console.log('API Server running');" } }] });
            } else if (modelId === "qwen2.5-coder:7b" && request.systemPrompt.includes("tester")) {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Tests written", toolCalls: [{ tool: "write_file", args: { path: "test.js", content: "console.log('Tests pass');" } }, { tool: "execute_shell", args: { command: "node test.js" } }] });
            } else {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Task done" });
            }
            
            return {
                content: mockContent,
                model: modelId,
                durationMs: Date.now() - start
            };
        }
    }
}
