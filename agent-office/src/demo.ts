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

async function main() {
    console.log("Initializing Agent Office - Phase 1...");

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

    const orchestrator = new Orchestrator(
        athena,
        ares,
        apollo,
        workerFactory,
        projectRepo,
        milestoneRepo,
        issueRepo,
        verificationRepo
    );

    const projectId = crypto.randomUUID();
    const projectSpec = `
Create a simple REST API with a health-check endpoint.
Requirement: GET /health returns HTTP 200 with {"status": "ok"}
Language: Node.js/JavaScript
`;

    projectRepo.create({
        id: projectId,
        name: "Demo REST API",
        specification: projectSpec,
        successCriteria: "GET /health returns HTTP 200 with {'status': 'ok'}",
        currentPhase: "IDLE"
    });

    console.log(`Created Project: ${projectId}`);
    
    await orchestrator.runProject(projectId);
}

main().catch(console.error);
