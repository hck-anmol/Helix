import { ModelProvider } from "./ModelProvider";
import { ModelRequest, ModelResponse } from "./models";
import { eventEmitter } from "../observability/EventEmitter";

export class OllamaProvider implements ModelProvider {
    private availableModelsCache: string[] | null = null;

    constructor(private readonly baseUrl: string) {}

    private async getAvailableModels(): Promise<string[]> {
        if (this.availableModelsCache) return this.availableModelsCache;
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            if (!res.ok) throw new Error("Failed to fetch tags");
            const data = await res.json();
            this.availableModelsCache = data.models.map((m: any) => m.name);
            return this.availableModelsCache!;
        } catch (e) {
            return []; // Will fall through to connection error or mock
        }
    }

    private emit(req: ModelRequest, eventType: "OLLAMA_CALL_STARTED" | "OLLAMA_CALL_COMPLETED" | "OLLAMA_CALL_FAILED", extra: any = {}) {
        if (!req.context) return;
        eventEmitter.emit({
            projectId: req.context.projectId,
            milestoneId: req.context.milestoneId,
            issueId: req.context.issueId,
            contractId: req.context.contractId,
            agentRunId: req.context.agentRunId,
            eventType,
            ...extra
        });
    }

    async generate(modelId: string, request: ModelRequest): Promise<ModelResponse> {
        const start = Date.now();
        
        this.emit(request, "OLLAMA_CALL_STARTED", { model: modelId });

        if (process.env.AGENT_OFFICE_MOCK_LLM !== 'true') {
            const availableModels = await this.getAvailableModels();
            if (availableModels.length > 0 && !availableModels.includes(modelId) && !availableModels.includes(modelId + ":latest")) {
                const err = new Error(`Ollama model '${modelId}' is not installed.\nAvailable models: ${availableModels.join(', ')}`);
                this.emit(request, "OLLAMA_CALL_FAILED", { model: modelId, durationMs: Date.now() - start, status: "FAILED", message: err.message, metadata: { errorType: "MODEL_NOT_FOUND" } });
                throw err;
            }
        }
        
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
            
            const durationMs = Date.now() - start;
            this.emit(request, "OLLAMA_CALL_COMPLETED", { model: data.model, durationMs, status: "SUCCESS", metadata: { responseSize: data.response?.length } });

            return {
                content: data.response,
                model: data.model,
                durationMs
            };
        } catch (error: any) {
            const durationMs = Date.now() - start;
            
            let errorType = "UNKNOWN";
            if (error.message.includes("fetch failed") || error.cause?.code === "ECONNREFUSED") errorType = "CONNECTION_ERROR";
            else if (error.message.includes("Ollama API error")) errorType = "HTTP_ERROR";
            
            if (process.env.AGENT_OFFICE_MOCK_LLM !== 'true') {
                const diag = {
                    model: modelId,
                    url: `${this.baseUrl}/api/generate`,
                    elapsedMs: durationMs,
                    error: error.message || String(error)
                };
                console.error(`[OllamaProvider] Diagnostic: ${JSON.stringify(diag)}`);
                
                this.emit(request, "OLLAMA_CALL_FAILED", { model: modelId, durationMs, status: "FAILED", message: error.message, metadata: { errorType } });
                throw new Error(`Ollama API error: ${error.message || String(error)}. Set AGENT_OFFICE_MOCK_LLM=true to use mock responses.`);
            }
            
            console.warn(`[OllamaProvider] Failed to reach Ollama or Mock forced. Using mock response for demo.`);
            // Mock responses keyed purely by role/prompt
            let mockContent = "";
            if (request.systemPrompt.includes("You are Athena")) {
                mockContent = JSON.stringify({ type: "MILESTONE", title: "API Setup", description: "Setup REST API with health check", acceptanceCriteria: ["Returns 200 on /health"], budget: 3 });
            } else if (request.systemPrompt.includes("You are Ares")) {
                mockContent = JSON.stringify({ type: "SCHEDULE", contracts: [{ receiver: "developer", contractType: "TASK", objective: "Write index.js", acceptanceCriteria: [], constraints: [] }, { receiver: "tester", contractType: "TASK", objective: "Write test.js", acceptanceCriteria: [], constraints: [] }] });
            } else if (request.systemPrompt.includes("You are Apollo")) {
                mockContent = JSON.stringify({ type: "VERIFICATION", status: "PASS", evidence: ["Tests passed"], failures: [], requiredFixes: [] });
            } else if (request.systemPrompt.includes("You are Reviewer")) {
                mockContent = JSON.stringify({ status: "PASS", summary: "Code looks good", findings: [] });
            } else if (request.systemPrompt.includes("developer")) {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Code written", toolCalls: [{ tool: "write_file", args: { path: "index.js", content: "console.log('API Server running');" } }] });
            } else if (request.systemPrompt.includes("tester")) {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Tests written", toolCalls: [{ tool: "write_file", args: { path: "test.js", content: "console.log('Tests pass');" } }, { tool: "execute_shell", args: { command: "node test.js" } }] });
            } else {
                mockContent = JSON.stringify({ status: "COMPLETED", message: "Task done" });
            }
            
            this.emit(request, "OLLAMA_CALL_COMPLETED", { model: modelId, durationMs, status: "SUCCESS", metadata: { mock: true } });

            return {
                content: mockContent,
                model: modelId,
                durationMs
            };
        }
    }
}
