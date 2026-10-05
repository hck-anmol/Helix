import assert from "assert";
import { WriteFileTool } from "../src/tools/FileTools";
import fs from "fs";
import path from "path";
import os from "os";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { Ares } from "../src/agents/managers/ares/Ares";
import { AgentContext } from "../src/agents/base/AgentContext";
import { Worker } from "../src/agents/workers/Worker";
import crypto from "crypto";

async function runTests() {
    console.log("Running Reliability Tests...");
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-office-test-"));

    // 1. WriteFile newline preservation
    const writeTool = new WriteFileTool();
    const contentWithNewline = "#ifndef foo\\n#define foo";
    const parsedNewline = JSON.parse(`{"content": "#ifndef foo\\n#define foo"}`).content;
    
    await writeTool.execute({ path: "test_newline.txt", content: parsedNewline }, { workspaceRoot, projectId: "test" });
    const written1 = fs.readFileSync(path.join(workspaceRoot, "test_newline.txt"), "utf8");
    assert.strictEqual(written1, "#ifndef foo\n#define foo", "Newline preservation failed");
    console.log("✅ WriteFile newline preservation passed");

    // 2. C++ escape preservation
    const cppmSource = `std::cout << "\\n";`;
    const parsedCpp = JSON.parse(`{"content": "std::cout << \\"\\\\n\\";"}`).content;
    await writeTool.execute({ path: "test_cpp.txt", content: parsedCpp }, { workspaceRoot, projectId: "test" });
    const written2 = fs.readFileSync(path.join(workspaceRoot, "test_cpp.txt"), "utf8");
    assert.strictEqual(written2, cppmSource, "C++ escape preservation failed");
    console.log("✅ C++ escape preservation passed");

    // Ares mock setup
    let aresAttempts = 0;
    let aresMockResponses: string[] = [];
    
    class MockAres extends Ares {
        constructor() { super({} as any, {} as any); }
        async invoke(prompt: string, context: AgentContext) {
            aresAttempts++;
            const response = aresMockResponses.shift() || "";
            try {
                const parsed = this.parseResponse(response);
                return { success: true, data: parsed, runId: crypto.randomUUID() };
            } catch (err: any) {
                return { success: false, error: err.message, runId: crypto.randomUUID() };
            }
        }
    }

    const mockAres = new MockAres();
    
    // Mock repositories for ParallelExecutor
    const mockIssueRepo = {
        updateStatus: (id: string, status: string) => {},
        incrementAttemptCount: (id: string) => {},
        incrementFixAttempts: (id: string) => {}
    };
    const mockEventEmitter = { emit: () => {} };

    const executor = new ParallelExecutor(
        {} as any, mockIssueRepo as any, {} as any, {} as any, {} as any, 
        {} as any, {} as any, {} as any, {} as any, {} as any, 
        {} as any, mockAres as any
    );

    const issue = { id: "issue1", title: "Test Issue", assignedRole: "developer" };
    const context = { projectId: "test", workspaceRoot } as any;

    // 3. Ares valid structured response
    aresAttempts = 0;
    aresMockResponses = [`{"type": "SCHEDULE", "contracts": [{"receiver": "developer", "contractType": "TASK", "objective": "test", "acceptanceCriteria": [], "constraints": []}]}`];
    
    // We hack executeIssue to just test Ares retry loop part by mocking contractRepo to throw so it exits early after Ares success
    const mockContractRepo = { create: () => { throw new Error("ARES_SUCCESS"); } };
    (executor as any).contractRepo = mockContractRepo;
    
    try {
        await (executor as any).executeIssue(issue, context);
    } catch(e: any) {
        assert.strictEqual(e.message, "ARES_SUCCESS");
    }
    assert.strictEqual(aresAttempts, 1, "Ares valid response should take 1 attempt");
    console.log("✅ Ares valid structured response passed");

    // 4. Ares malformed response -> retry -> success
    aresAttempts = 0;
    aresMockResponses = [
        `{ malformed json`, 
        `{"type": "SCHEDULE", "contracts": [{"receiver": "developer", "contractType": "TASK", "objective": "test", "acceptanceCriteria": [], "constraints": []}]}`
    ];
    try { await (executor as any).executeIssue(issue, context); } catch(e: any) {}
    assert.strictEqual(aresAttempts, 2, "Ares malformed retry failed");
    console.log("✅ Ares malformed response -> retry -> success passed");

    // 5. Ares schema-invalid response -> retry -> success
    aresAttempts = 0;
    aresMockResponses = [
        `{"type": "UNKNOWN", "contracts": []}`, 
        `{"type": "SCHEDULE", "contracts": [{"receiver": "developer", "contractType": "TASK", "objective": "test", "acceptanceCriteria": [], "constraints": []}]}`
    ];
    try { await (executor as any).executeIssue(issue, context); } catch(e: any) {}
    assert.strictEqual(aresAttempts, 2, "Ares schema-invalid retry failed");
    console.log("✅ Ares schema-invalid response -> retry -> success passed");

    // 6. Ares fails after maximum 3 attempts
    aresAttempts = 0;
    aresMockResponses = [
        `{"type": "UNKNOWN"}`, 
        `{"type": "UNKNOWN"}`,
        `{"type": "UNKNOWN"}`
    ];
    let failedEventEmitted = false;
    require("../src/observability/EventEmitter").eventEmitter.emit = (event: any) => {
        if (event.eventType === "ISSUE_FAILED" && event.message === "Ares failed to schedule issue") {
            failedEventEmitted = true;
        }
    };
    await (executor as any).executeIssue(issue, context);
    assert.strictEqual(aresAttempts, 3, "Ares max attempts failed");
    assert.strictEqual(failedEventEmitted, true, "Issue FAILED event not emitted");
    console.log("✅ Ares fails after maximum 3 attempts passed");

    // 7. Prompt contamination regression
    const worker = new Worker("developer", { objective: "obj", acceptanceCriteria: [], constraints: [] }, [], {} as any, {} as any);
    const prompt = worker.getSystemPrompt(context);
    assert.strictEqual(prompt.includes("app.js"), false, "Prompt contains app.js");
    console.log("✅ Prompt contamination regression passed");

    console.log("All reliability tests passed!");
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
