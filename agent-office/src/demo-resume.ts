import { config } from "./config/config";
import { ModelProvider } from "./llm/ModelProvider";
import { ModelRequest, ModelResponse } from "./llm/models";
import { ModelRouter } from "./llm/ModelRouter";
import { ProjectRepository } from "./persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "./persistence/repositories/MilestoneRepository";
import { AgentRunRepository } from "./persistence/repositories/AgentRunRepository";
import { IssueRepository } from "./persistence/repositories/IssueRepository";
import { VerificationRepository } from "./persistence/repositories/VerificationRepository";
import { TestResultRepository } from "./persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";
import { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";
import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";
import { Athena } from "./agents/managers/athena/Athena";
import { Ares } from "./agents/managers/ares/Ares";
import { Apollo } from "./agents/managers/apollo/Apollo";
import { Reviewer } from "./agents/managers/reviewer/Reviewer";
import { WorkerFactory } from "./agents/workers/WorkerFactory";
import { Orchestrator } from "./orchestration/Orchestrator";
import { ReadFileTool, WriteFileTool, ListFilesTool } from "./tools/FileTools";
import { ShellTool } from "./tools/ShellTools";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// A deterministic provider that crashes on the first developer run, then succeeds.
class DeterministicResumeProvider implements ModelProvider {
    public developerAttempts = 0;

    async generate(modelId: string, request: ModelRequest): Promise<ModelResponse> {
        let mockContent = "";

        if (request.systemPrompt.includes("You are Athena")) {
            mockContent = JSON.stringify({ 
                type: "MILESTONE", 
                title: "Resume Demo Milestone", 
                description: "Test resume", 
                acceptanceCriteria: ["Resumes properly"], 
                budget: 2,
                suggestedTasks: [{ title: "Write script", type: "FEATURE" }]
            });
        } 
        else if (request.systemPrompt.includes("You are Ares")) {
            const readyIssueMatch = request.prompt.match(/- \[([^\]]+)\]/);
            const issueId = readyIssueMatch ? readyIssueMatch[1] : crypto.randomUUID();
            mockContent = JSON.stringify({ 
                type: "SCHEDULE", 
                tasks: [{ issueId, workerRole: "developer", task: "Write script" }] 
            });
        } 
        else if (request.systemPrompt.includes("developer")) {
            this.developerAttempts++;
            if (this.developerAttempts === 1) {
                console.log("\n>>> SIMULATING FATAL PROCESS CRASH DURING WORKER EXECUTION <<<\n");
                throw new Error("simulated process crash");
            } else {
                mockContent = JSON.stringify({ 
                    status: "COMPLETED", 
                    message: "Completed after crash", 
                    toolCalls: [{ tool: "write_file", args: { path: "script.js", content: "console.log('Done');" } }] 
                });
            }
        }
        else if (request.systemPrompt.includes("Reviewer")) {
            mockContent = JSON.stringify({ 
                status: "PASS", 
                summary: "Looks good", 
                findings: [] 
            });
        }
        else if (request.systemPrompt.includes("You are Apollo")) {
            mockContent = JSON.stringify({ 
                type: "VERIFICATION", 
                status: "PASS", 
                evidence: ["Pass"], 
                failures: [], 
                requiredFixes: [] 
            });
        }
        else {
            mockContent = JSON.stringify({ status: "COMPLETED", message: "Done" });
        }

        return { content: mockContent, model: modelId, durationMs: 10 };
    }
}

async function main() {
    console.log("=== PHASE 1: STARTING PROJECT UNTIL CRASH ===");

    const provider1 = new DeterministicResumeProvider();
    const router1 = new ModelRouter(provider1);

    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const runRepo = new AgentRunRepository();
    const issueRepo = new IssueRepository();
    const verificationRepo = new VerificationRepository();
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();

    const athena1 = new Athena(router1, runRepo);
    const ares1 = new Ares(router1, runRepo);
    const apollo1 = new Apollo(router1, runRepo);
    const reviewer1 = new Reviewer(router1, runRepo);
    const tools = [new ReadFileTool(), new WriteFileTool(), new ListFilesTool(), new ShellTool()];
    const workerFactory1 = new WorkerFactory(router1, runRepo, tools);

    const orchestrator1 = new Orchestrator(
        athena1, ares1, apollo1, reviewer1, workerFactory1, 
        projectRepo, milestoneRepo, issueRepo, verificationRepo, 
        testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo
    );

    const projectId = crypto.randomUUID();
    const projectSpec = `Create a resume script.`;

    projectRepo.create({
        id: projectId,
        name: "Demo Resume Deterministic",
        specification: projectSpec,
        successCriteria: "script exists",
        currentPhase: "IDLE"
    });
    
    const workspaceRoot = path.join(config.workspaceRoot, projectId);
    fs.mkdirSync(workspaceRoot, { recursive: true });

    // Start it. It will crash during the worker.
    try {
        await orchestrator1.runProject(projectId);
    } catch (e) {
        // Expected to throw from simulated crash handling? Actually Orchestrator swallows it and halts.
    }

    // Because we used an exception to simulate a process crash, BaseAgent caught it and marked it FAILED.
    // We manually set it back to RUNNING to correctly simulate a real hardware/process crash.
    const { db } = require("./persistence/database");
    db.prepare(`UPDATE agent_runs SET status = 'RUNNING' WHERE projectId = ? AND role = 'developer'`).run(projectId);
    fs.writeFileSync(path.join(workspaceRoot, "hello.js"), "// partial code...");

    console.log("\n=== PHASE 2: RESUMING ORCHESTRATOR FROM CRASH ===");
    
    // We reuse the deterministic provider instance so attempt count correctly passes 1
    const router2 = new ModelRouter(provider1);
    
    const athena2 = new Athena(router2, runRepo);
    const ares2 = new Ares(router2, runRepo);
    const apollo2 = new Apollo(router2, runRepo);
    const reviewer2 = new Reviewer(router2, runRepo);
    const workerFactory2 = new WorkerFactory(router2, runRepo, tools);

    const orchestrator2 = new Orchestrator(
        athena2, ares2, apollo2, reviewer2, workerFactory2, 
        projectRepo, milestoneRepo, issueRepo, verificationRepo, 
        testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo
    );

    // Call resume exactly once
    await orchestrator2.resumeProject(projectId);
    
    console.log("\n=== PHASE 3: VERIFY IDEMPOTENCY ===");
    await orchestrator2.resumeProject(projectId);

    console.log("\n=== DEMO RESUME COMPLETE ===");
}

main().catch(console.error);
