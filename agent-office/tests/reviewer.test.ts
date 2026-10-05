import { Reviewer } from "../src/agents/managers/reviewer/Reviewer";
import { ModelRouter } from "../src/llm/ModelRouter";
import { ModelProvider } from "../src/llm/ModelProvider";
import { AgentRunRepository } from "../src/persistence/repositories/AgentRunRepository";
import { AgentContext } from "../src/agents/base/AgentContext";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { AgentContractRepository } from "../src/persistence/repositories/AgentContractRepository";
import { CodeReviewRepository } from "../src/persistence/repositories/CodeReviewRepository";
import { TestResultRepository } from "../src/persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "../src/persistence/repositories/ArtifactChangeRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";
import { VerificationRepository } from "../src/persistence/repositories/VerificationRepository";
import { WorkerFactory } from "../src/agents/workers/WorkerFactory";
import { Ares } from "../src/agents/managers/ares/Ares";
import crypto from "crypto";
import { db } from "../src/persistence/database";

class MockProvider implements ModelProvider {
    responses: string[] = [];
    async generate(modelId: string, request: any) {
        const res = this.responses.shift() || "{}";
        return { content: res, model: modelId, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    }
}

export async function run() {
    console.log("Running Reviewer Tests...");
    
    const provider = new MockProvider();
    const router = new ModelRouter(provider);
    const runRepo = new AgentRunRepository();
    const reviewer = new Reviewer(router, runRepo);
    
    const context: AgentContext = {
        projectId: "p1",
        currentMilestoneId: "m1",
        currentIssueId: "i1",
        workspaceRoot: "",
        historicalContext: ""
    };
    
    // 1. Valid JSON -> PASS
    provider.responses = [`{ "status": "PASS", "summary": "Looks good", "findings": [] }`];
    let res = await reviewer.invoke("test", context);
    if (!res.success || res.data?.status !== "PASS") throw new Error("Failed 1");

    // 2. JSON wrapped in Markdown -> correctly extracted
    provider.responses = [`Here is the json:\n\`\`\`json\n{ "status": "FAIL", "summary": "Bad", "findings": [] }\n\`\`\`\nDone.`];
    res = await reviewer.invoke("test", context);
    if (!res.success || res.data?.status !== "FAIL") throw new Error("Failed 2");
    
    // 3. Malformed JSON -> rejected
    provider.responses = [`{ "status": "PASS", "summary": "Looks good", "findings": [`];
    res = await reviewer.invoke("test", context);
    if (res.success) throw new Error("Failed 3: Should reject malformed JSON");

    // 4. Status COMPLETED -> normalized to PASS (acceptable model variation)
    provider.responses = [`{ "status": "COMPLETED", "summary": "Looks good", "findings": [] }`];
    res = await reviewer.invoke("test", context);
    if (!res.success || res.data?.status !== "PASS") throw new Error("Failed 4: COMPLETED should normalize to PASS");

    // 5. Missing summary -> defaults to empty string (lenient)
    provider.responses = [`{ "status": "PASS", "findings": [] }`];
    res = await reviewer.invoke("test", context);
    if (!res.success || res.data?.summary !== "") throw new Error("Failed 5: Missing summary should default to empty string");

    // 6. Missing findings -> defaults to [] (lenient)
    provider.responses = [`{ "status": "PASS", "summary": "Looks good" }`];
    res = await reviewer.invoke("test", context);
    if (!res.success || !Array.isArray(res.data?.findings)) throw new Error("Failed 6: Missing findings should default to []");

    // 7. Wrong field types -> rejected
    provider.responses = [`{ "status": "PASS", "summary": 123, "findings": {} }`];
    res = await reviewer.invoke("test", context);
    if (res.success) throw new Error("Failed 7: Should reject wrong types");

    console.log("Reviewer Agent schema tests passed!");

    // Test retry logic in ParallelExecutor
    const projectRepo = new ProjectRepository();
    const issueRepo = new IssueRepository();
    const contractRepo = new AgentContractRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const testResultRepo = new TestResultRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const milestoneRepo = new MilestoneRepository();
    const verificationRepo = new VerificationRepository();
    const ares = new Ares(router, runRepo);
    const workerFactory = new WorkerFactory(router, runRepo, []);
    
    const executor = new ParallelExecutor(
        projectRepo, issueRepo, contractRepo, runRepo, artifactChangeRepo,
        testResultRepo, codeReviewRepo, milestoneRepo, verificationRepo,
        workerFactory, reviewer, ares
    );

    // Mock executeIssue dependencies
    const pid = crypto.randomUUID();
    const mid = crypto.randomUUID();
    const issue = { id: crypto.randomUUID(), projectId: pid, milestoneId: mid, title: "Test", description: "", type: "FEATURE" as any, priority: "HIGH" as any, status: "VERIFYING" as any, fixAttempts: 0, attemptCount: 0 };
    projectRepo.create({ id: pid, name: pid, specification: "spec", successCriteria: JSON.stringify([]), architecture: "", status: "ACTIVE", currentPhase: "", createdAt: "" } as any);
    milestoneRepo.create({ id: mid, projectId: pid, title: mid, description: "", status: "PLANNED", orderIndex: 0, budget: 0 } as any);
    issueRepo.create(issue);
    const runId = crypto.randomUUID();
    runRepo.create({ id: runId, projectId: pid, milestoneId: mid, issueId: issue.id, agentId: "w1", role: "developer", model: "qwen", task: "test", phase: "EXECUTING", status: "COMPLETED", output: "" } as any);

    let invokeCount = 0;
    reviewer.invoke = async () => {
        invokeCount++;
        const response = provider.responses.shift();
        if (response === "FAIL_PARSE") {
            return { success: false, error: "Parse error", runId: runId };
        }
        return { success: true, data: { status: "PASS", summary: "Ok", findings: [] }, rawOutput: "", runId: runId };
    };

    ares.invoke = async () => ({ success: true, data: { type: "SCHEDULE", contracts: [{ receiver: "developer" as any, contractType: "TASK", objective: "test", acceptanceCriteria: [], constraints: [] }] }, rawOutput: "", runId: "r2" });
    
    workerFactory.createWorker = () => ({
        id: "w1", role: "developer", executeTask: async () => ({ success: true, data: { status: "COMPLETED", message: "Done" }, runId: runId })
    } as any);
    
    const { ArtifactSnapshot } = require("../src/utils/ArtifactSnapshot");
    ArtifactSnapshot.takeSnapshot = () => ({});
    ArtifactSnapshot.compare = () => [{ path: "test.ts", changeType: "MODIFIED", beforeSize: 0, afterSize: 0, beforeHash: "", afterHash: "" }];


    // 8. Reviewer fails first attempt but succeeds second
    provider.responses = ["FAIL_PARSE", "PASS"];
    invokeCount = 0;
    await (executor as any).executeIssue(issue, context);
    if (invokeCount !== 2) throw new Error("Failed 8: Should have retried once. Expected 2 invocations, got " + invokeCount);
    if (issueRepo.get(issue.id)?.status !== "RESOLVED") throw new Error("Failed 8: Issue should be RESOLVED");

    // 9. Reviewer fails all 3 attempts
    const issue2 = { ...issue, id: crypto.randomUUID(), status: "VERIFYING" as any };
    issueRepo.create(issue2);
    provider.responses = ["FAIL_PARSE", "FAIL_PARSE", "FAIL_PARSE", "PASS"];
    invokeCount = 0;
    artifactChangeRepo.listByIssue = () => [{ id: "ac2", projectId: pid, milestoneId: mid, issueId: issue2.id, agentRunId: "r1", path: "test.ts", changeType: "MODIFIED", beforeHash: "", afterHash: "", beforeSize: 0, afterSize: 0, createdAt: "" }];
    await (executor as any).executeIssue(issue2, context);
    if (invokeCount !== 3) throw new Error("Failed 9/10: Should have stopped after 3 attempts. Got " + invokeCount);
    // After 3 parse failures the review gate is bypassed: issue proceeds to RESOLVED (not FAILED)
    if (issueRepo.get(issue2.id)?.status !== "RESOLVED") throw new Error("Failed 9: Issue should be RESOLVED after 3 review parse failures (bypass gate)");



    console.log("Reviewer retry logic tests passed!");
}
