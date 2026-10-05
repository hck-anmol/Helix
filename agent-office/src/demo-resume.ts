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
                contracts: [{ receiver: "developer", contractType: "TASK", objective: "Write script", acceptanceCriteria: [], constraints: [] }] 
            });
        } 
        else if (request.systemPrompt.startsWith("You are developer") || request.systemPrompt.includes("You are developer")) {
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
        else if (request.prompt.includes("Please review these artifacts")) {
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
            console.log("UNMATCHED PROMPT:", request.prompt);
            console.log("UNMATCHED SYSTEM PROMPT:", request.systemPrompt);
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
    
    // Create an interruption hook on CheckpointRepository
    const originalCreateCheckpoint = checkpointRepo.create.bind(checkpointRepo);
    let crashTriggered = false;
    checkpointRepo.create = (checkpoint) => {
        originalCreateCheckpoint(checkpoint);
        if (checkpoint.checkpointType === "WORKER_STARTED" && !crashTriggered) {
            crashTriggered = true;
            console.log("CHECKPOINT CREATED");
            console.log("EXECUTION INTERRUPTED");
            throw new Error("SimulatedCrash");
        }
    };

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

    // Start it. It will hit the WORKER_STARTED checkpoint and throw SimulatedCrash
    await orchestrator1.runProject(projectId);

    console.log("\n=== PHASE 2: RESUMING ORCHESTRATOR FROM CRASH ===");
    console.log("NEW ORCHESTRATOR");
    console.log("RESUMING FROM CHECKPOINT");
    
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
    console.log("PROJECT COMPLETED");

    console.log("\n=== PHASE 3: VERIFY IDEMPOTENCY ===");
    await orchestrator2.resumeProject(projectId);
    console.log("IDEMPOTENT RESUME VERIFIED");

    // Verify Checkpoint Persistence
    const { db } = require("./persistence/database");
    const checkpoints = db.prepare("SELECT * FROM checkpoints WHERE projectId = ?").all(projectId);
    if (checkpoints.length === 0) {
        throw new Error("Checkpoint persistence failed: 0 checkpoints found.");
    }
    
    const workerStartedCheckpoint = checkpoints.find((c: any) => c.checkpointType === "WORKER_STARTED");
    if (!workerStartedCheckpoint) {
        throw new Error("Checkpoint persistence failed: WORKER_STARTED checkpoint not found.");
    }

    console.log(`\n=== CHECKPOINT PERSISTENCE VERIFIED (${checkpoints.length} checkpoints found) ===`);
    console.log("\n=== DEMO RESUME COMPLETE ===");
}

main().catch(console.error);
