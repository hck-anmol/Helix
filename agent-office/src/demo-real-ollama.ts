import { config } from "./config/config";
import { OllamaProvider } from "./llm/OllamaProvider";
import { ModelRouter } from "./llm/ModelRouter";
import { ProjectRepository } from "./persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "./persistence/repositories/MilestoneRepository";
import { AgentRunRepository } from "./persistence/repositories/AgentRunRepository";
import { IssueRepository } from "./persistence/repositories/IssueRepository";
import { VerificationRepository } from "./persistence/repositories/VerificationRepository";
import { Athena } from "./agents/managers/athena/Athena";
import { Ares } from "./agents/managers/ares/Ares";
import { Apollo } from "./agents/managers/apollo/Apollo";
import { WorkerFactory } from "./agents/workers/WorkerFactory";
import { Orchestrator } from "./orchestration/Orchestrator";
import { ReadFileTool, WriteFileTool, ListFilesTool } from "./tools/FileTools";
import { ShellTool } from "./tools/ShellTools";
import crypto from "crypto";
import fs from "fs";
import path from "path";

async function main() {
    console.log("Initializing Agent Office - Real Ollama Demo...");
    
    // Explicitly disable mock
    process.env.AGENT_OFFICE_MOCK_LLM = "false";

    const provider = new OllamaProvider(config.ollamaBaseUrl);
    const router = new ModelRouter(provider);

    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const runRepo = new AgentRunRepository();
    const issueRepo = new IssueRepository();
    const verificationRepo = new VerificationRepository();

    const athena = new Athena(router, runRepo);
    const ares = new Ares(router, runRepo);
    const apollo = new Apollo(router, runRepo);

    const tools = [
        new ReadFileTool(),
        new WriteFileTool(),
        new ListFilesTool(),
        new ShellTool()
    ];
    const workerFactory = new WorkerFactory(router, runRepo, tools);

    const testResultRepo = new (require("./persistence/repositories/TestResultRepository").TestResultRepository)();
    const artifactChangeRepo = new (require("./persistence/repositories/ArtifactChangeRepository").ArtifactChangeRepository)();
    const codeReviewRepo = new (require("./persistence/repositories/CodeReviewRepository").CodeReviewRepository)();
    const reviewer = new (require("./agents/managers/reviewer/Reviewer").Reviewer)(router, runRepo);

    const orchestrator = new Orchestrator(
        athena, ares, apollo, reviewer, workerFactory,
        projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo
    );

    const projectId = crypto.randomUUID();
    const projectSpec = `
CRITICAL DIRECTIVE: Create a milestone for a Node.js project containing EXACTLY ONE task.
The ONLY task must be: "Create hello.js script that prints Hello, real Ollama!"
Do NOT suggest any web servers, APIs, or user models. ONLY suggest the hello.js script.
`;

    projectRepo.create({
        id: projectId,
        name: "Demo Real Ollama",
        specification: projectSpec,
        successCriteria: "hello.js exists and logs correctly",
        currentPhase: "IDLE"
    });

    const workspaceRoot = path.join(config.workspaceRoot, projectId);
    fs.mkdirSync(workspaceRoot, { recursive: true });

    console.log(`Created Project: ${projectId}`);
    
    await orchestrator.runProject(projectId);
}

main().catch(console.error);
