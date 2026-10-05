import { Orchestrator } from "./orchestration/Orchestrator";
import { Athena } from "./agents/managers/athena/Athena";
import { Ares } from "./agents/managers/ares/Ares";
import { Apollo } from "./agents/managers/apollo/Apollo";
import { WorkerFactory } from "./agents/workers/WorkerFactory";
import { ProjectRepository } from "./persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "./persistence/repositories/MilestoneRepository";
import { IssueRepository } from "./persistence/repositories/IssueRepository";
import { VerificationRepository } from "./persistence/repositories/VerificationRepository";
import { AgentRunRepository } from "./persistence/repositories/AgentRunRepository";
import { ModelRouter } from "./llm/ModelRouter";
import { OllamaProvider } from "./llm/OllamaProvider";
import { config } from "./config/config";
import { ReadFileTool, WriteFileTool, ListFilesTool } from "./tools/FileTools";
import { ShellTool } from "./tools/ShellTools";
import crypto from "crypto";

async function main() {
    const provider = new OllamaProvider(config.ollamaBaseUrl);
    const modelRouter = new ModelRouter(provider);
    const runRepo = new AgentRunRepository();
    
    const athena = new Athena(modelRouter, runRepo);
    const ares = new Ares(modelRouter, runRepo);
    const apollo = new Apollo(modelRouter, runRepo);
    const reviewer = new (require("./agents/managers/reviewer/Reviewer").Reviewer)(modelRouter, runRepo);

    const tools = [
        new ReadFileTool(),
        new WriteFileTool(),
        new ListFilesTool(),
        new ShellTool()
    ];
    const workerFactory = new WorkerFactory(modelRouter, runRepo, tools);
    
    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const issueRepo = new IssueRepository();
    const verificationRepo = new VerificationRepository();

    const testResultRepo = new (require("./persistence/repositories/TestResultRepository").TestResultRepository)();
    const artifactChangeRepo = new (require("./persistence/repositories/ArtifactChangeRepository").ArtifactChangeRepository)();
    const codeReviewRepo = new (require("./persistence/repositories/CodeReviewRepository").CodeReviewRepository)();

    const orchestrator = new Orchestrator(
        athena, ares, apollo, reviewer, workerFactory,
        projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo
    );

    const projectId = crypto.randomUUID();
    projectRepo.create({
        id: projectId,
        name: "Health API",
        specification: "Build a Health API that returns the server status. It should have a /health endpoint.",
        successCriteria: "API runs and returns 200 OK from /health",
        currentPhase: "PLANNED"
    });

    console.log(`[DEMO] Created Project: ${projectId}`);

    // Mock Athena to inject specific suggestedTasks with dependencies
    const originalAthenaInvoke = athena.invoke.bind(athena);
    athena.invoke = async (prompt, context) => {
        return {
            success: true,
            data: {
                type: "MILESTONE",
                title: "Build Health API",
                description: "Implement the Health API",
                budget: 10,
                acceptanceCriteria: ["API works"],
                suggestedTasks: [
                    { title: "ISSUE-001: Create server", type: "TASK" },
                    { title: "ISSUE-002: Implement /health", type: "TASK" },
                    { title: "ISSUE-003: Create health test", type: "TASK" },
                    { title: "ISSUE-004: Run integration verification", type: "TASK" }
                ]
            }
        };
    };

    // We will intercept the issues after they are created to set up the dependencies
    const originalCreate = issueRepo.create.bind(issueRepo);
    let createdIssues: any[] = [];
    issueRepo.create = (issue) => {
        originalCreate(issue);
        if (issue.title.startsWith("ISSUE-")) {
            createdIssues.push(issue);
            if (createdIssues.length === 4) {
                console.log("[DEMO] Adding Dependencies...");
                issueRepo.addDependency(createdIssues[1].id, createdIssues[0].id); // 002 depends on 001
                issueRepo.addDependency(createdIssues[2].id, createdIssues[1].id); // 003 depends on 002
                issueRepo.addDependency(createdIssues[3].id, createdIssues[2].id); // 004 depends on 003
                console.log("[DEMO] Dependencies added: 001 -> 002 -> 003 -> 004");
            }
        }
    };

    // Mock Ares so we don't have to wait for Ollama (since models aren't downloaded locally and it takes too long to timeout)
    let aresCallCount = 0;
    ares.invoke = async (prompt, context) => {
        aresCallCount++;
        const contracts: any[] = [];
        const match = prompt.match(/Schedule this READY issue: (.*?) \(Role:/);
        if (match && match[1]) {
            contracts.push({
                receiver: "developer" as any,
                objective: "Execute task",
                acceptanceCriteria: [], 
                constraints: [], 
                contractType: "TASK" as const
            });
        }
        return {
            success: true,
            data: {
                type: "SCHEDULE",
                contracts
            }
        };
    };

    // Mock workers to instantly succeed
    const originalCreateWorker = workerFactory.createWorker.bind(workerFactory);
    workerFactory.createWorker = (role, contract) => {
        const worker = originalCreateWorker(role, contract);
        worker.executeTask = async (context) => {
            return {
                success: true,
                data: {
                    status: "COMPLETED",
                    message: "Task completed successfully"
                }
            };
        };
        return worker;
    };

    // Mock Apollo to pass
    apollo.invoke = async (prompt, context) => {
        return {
            success: true,
            data: {
                type: "VERIFICATION",
                status: "PASS",
                evidence: ["All tests passed"],
                failures: [],
                requiredFixes: []
            }
        };
    };

    await orchestrator.runProject(projectId);
    console.log("[DEMO] Finished.");
}

main().catch(console.error);
