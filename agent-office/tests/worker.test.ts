import { Worker } from "../src/agents/workers/Worker";
import { ModelRouter } from "../src/llm/ModelRouter";
import { AgentRunRepository } from "../src/persistence/repositories/AgentRunRepository";
import { Tool } from "../src/tools/Tool";
import assert from "assert";
import fs from "fs";
import path from "path";

// Mock Tool
class MockWriteFileTool implements Tool {
    name = "write_file";
    description = "Writes a file";
    async execute(args: any, context: any) {
        return "Success";
    }
}

class MockModelRouter extends ModelRouter {
    public nextResponses: string[] = [];
    public invocationCount = 0;

    constructor() {
        super(null as any);
    }

    async route(role: string, request: any): Promise<{ content: string; model: string; durationMs: number; }> {
        this.invocationCount++;
        const resp = this.nextResponses.shift();
        if (resp === undefined) {
            throw new Error("No mocked response available");
        }
        return { content: resp, model: "mock", durationMs: 1 };
    }
}

export async function run() {
    console.log("Running Worker Output Tests...");

    const router = new MockModelRouter();
    const runRepo = new AgentRunRepository();
    // Use an in-memory DB or just mock it, but agent-office tests run on real DB.
    // We'll let it use the real test DB since other tests do.

    const contract = {
        objective: "Write a mock file",
        acceptanceCriteria: [],
        constraints: []
    };

    const worker = new Worker("developer", contract, [new MockWriteFileTool()], router, runRepo);
    const context = {
        projectId: "test-proj",
        workspaceRoot: "/tmp",
        projectSpec: "Test project"
    };

    // 1. Valid JSON
    router.nextResponses = [
        `{ "status": "COMPLETED", "message": "Done", "filesChanged": ["a.js"] }`
    ];
    let res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.status, "COMPLETED");

    // 2. Markdown-wrapped JSON
    router.nextResponses = [
        `\`\`\`json\n{ "status": "COMPLETED", "message": "Done", "filesChanged": ["b.js"] }\n\`\`\``
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.filesChanged?.[0], "b.js");

    // 3. Surrounding text
    router.nextResponses = [
        `Here is the output you requested:
        { "status": "FAILED", "message": "Error occurred" }
        Hope this helps!`
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.status, "FAILED");

    // 4. Malformed JSON (should trigger retry and succeed on 2nd attempt)
    router.invocationCount = 0;
    router.nextResponses = [
        `{ "status": "COMPLETED", "message": "Missing quote }`,
        `{ "status": "COMPLETED", "message": "Fixed quote" }`
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.message, "Fixed quote");
    assert.strictEqual(router.invocationCount, 2);

    // 5. Truncated JSON (retry and succeed)
    router.invocationCount = 0;
    router.nextResponses = [
        `{ "status": "COMPLETED", "message": "Truncate`,
        `{ "status": "COMPLETED", "message": "Fixed truncation" }`
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.invocationCount, 2);

    // 6. Schema-invalid JSON (retry and succeed)
    router.invocationCount = 0;
    router.nextResponses = [
        `{ "status": "UNKNOWN", "message": "Bad enum" }`,
        `{ "status": "COMPLETED", "message": "Good enum" }`
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(router.invocationCount, 2);

    // 7. Retry exhaustion
    router.invocationCount = 0;
    router.nextResponses = [
        `{ "status": "UNKNOWN" }`,
        `{ "status": "UNKNOWN" }`,
        `{ "status": "UNKNOWN" }`
    ];
    res = await worker.executeTask(context);
    assert.strictEqual(res.success, false);
    assert.strictEqual(router.invocationCount, 3);
    assert(res.error?.includes("Worker output validation failed"), "Should have validation error");

    console.log("Worker output parsing and retry tests passed!");
}
