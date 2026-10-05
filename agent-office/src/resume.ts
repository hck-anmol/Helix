import { config } from "./config/config";
import { OllamaProvider } from "./llm/OllamaProvider";
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

const projectId = process.argv[2];
if (!projectId) {
    console.error("Usage: npm run resume -- <project-id>");
    process.exit(1);
}

async function main() {
    console.log(`Initializing Resume Sequence for Project: ${projectId}`);

    const provider = new OllamaProvider(config.ollamaBaseUrl);
    const router = new ModelRouter(provider);

    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const runRepo = new AgentRunRepository();
    const issueRepo = new IssueRepository();
    const verificationRepo = new VerificationRepository();
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();

    const athena = new Athena(router, runRepo);
    const ares = new Ares(router, runRepo);
    const apollo = new Apollo(router, runRepo);
    const reviewer = new Reviewer(router, runRepo);

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
        reviewer,
        workerFactory,
        projectRepo,
        milestoneRepo,
        issueRepo,
        verificationRepo,
        testResultRepo,
        artifactChangeRepo,
        codeReviewRepo,
        checkpointRepo,
        runRepo
    );

    await orchestrator.resumeProject(projectId);
}

main().catch(console.error);
