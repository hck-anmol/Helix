import { OllamaProvider } from "../src/llm/OllamaProvider";
import { config } from "../src/config/config";

export async function run() {
    console.log("Running Ollama Integration Tests...");

    // Force real Ollama for this test
    const oldMockEnv = process.env.AGENT_OFFICE_MOCK_LLM;
    process.env.AGENT_OFFICE_MOCK_LLM = "false";

    const provider = new OllamaProvider(config.ollamaBaseUrl);

    try {
        // 1. Verify missing model produces clear error
        try {
            await provider.generate("non-existent-model-12345", {
                systemPrompt: "test",
                prompt: "test"
            });
            throw new Error("Expected missing model to throw an error, but it succeeded!");
        } catch (e: any) {
            if (e.message.includes("Expected missing model")) {
                throw e; // re-throw the assertion error
            }
            if (!e.message.includes("is not installed") && !e.message.includes("fetch failed") && !e.message.includes("ECONNREFUSED")) {
                throw new Error(`Expected 'not installed' or 'fetch failed' error message, got: ${e.message}`);
            }
            console.log("Missing model verification passed.");
        }

        // 2. Test successful generation with real installed model (qwen3:8b)
        // Note: we can assume qwen3:8b is the default based on the task prompt
        const targetModel = "qwen3:8b";
        
        console.log(`Testing real generation with ${targetModel}...`);
        try {
            const result = await provider.generate(targetModel, {
                systemPrompt: "You are a helpful assistant.",
                prompt: "Say the exact word 'HELLO' and nothing else."
            });

            if (!result.content || result.content.trim() === "") {
                throw new Error("Received empty response from Ollama");
            }
            
            if (result.model !== targetModel) {
                if (!result.model.includes(targetModel)) {
                    console.warn(`Warning: Expected model name ${targetModel}, but received ${result.model}`);
                }
            }
            
            console.log(`Received response: ${result.content}`);
            console.log("Ollama real integration test passed!");
            
        } catch (e: any) {
            if (e.message.includes("fetch failed") || e.message.includes("ECONNREFUSED")) {
                console.log("Ollama is not running locally. Skipping real generation test.");
                return;
            }
            throw e;
        }
        
    } finally {
        // Restore env
        if (oldMockEnv !== undefined) {
            process.env.AGENT_OFFICE_MOCK_LLM = oldMockEnv;
        } else {
            delete process.env.AGENT_OFFICE_MOCK_LLM;
        }
    }
}
