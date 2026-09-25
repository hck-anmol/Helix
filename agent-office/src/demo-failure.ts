import { config } from "./config/config";
import { ModelProvider } from "./llm/ModelProvider";
import { ModelRequest, ModelResponse } from "./llm/models";
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
import { Reviewer } from "./agents/managers/reviewer/Reviewer";
import { CheckpointRepository } from "./persistence/repositories/CheckpointRepository";
import { TestResultRepository } from "./persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";
import { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";
import { Orchestrator } from "./orchestration/Orchestrator";
import { ReadFileTool, WriteFileTool, ListFilesTool } from "./tools/FileTools";
import { ShellTool } from "./tools/ShellTools";
import crypto from "crypto";

class DeterministicFailureProvider implements ModelProvider {
    private attempt = 0;

    async generate(modelId: string, request: ModelRequest): Promise<ModelResponse> {
        let mockContent = "";

        if (request.systemPrompt.includes("You are Athena")) {
            mockContent = JSON.stringify({ 
                type: "MILESTONE", 
                title: "Health Endpoint", 
                description: "Setup /health", 
                acceptanceCriteria: ["Returns HTTP 200", "Response is {status: 'ok'}"], 
                budget: 3 
            });
        } 
        else if (request.systemPrompt.includes("You are Ares")) {
            const readyIssueMatch = request.prompt.match(/- \[([^\]]+)\]/);
            const issueId = readyIssueMatch ? readyIssueMatch[1] : crypto.randomUUID();
            
            mockContent = JSON.stringify({ 
                type: "SCHEDULE", 
                tasks: [{ issueId, workerRole: "developer", task: "Write API" }] 
            });
        } 
        else if (request.systemPrompt.includes("You are Apollo")) {
            this.attempt++;
            if (this.attempt === 1) {
                mockContent = JSON.stringify({ 
                    type: "VERIFICATION", 
                    status: "FAIL", 
                    evidence: ["Response was {status: 'error'}"], 
                    failures: ["Did not return {status: 'ok'}"], 
                    requiredFixes: ["Fix the /health response payload to be 'ok'"] 
                });
            } else {
                mockContent = JSON.stringify({ 
                    type: "VERIFICATION", 
                    status: "PASS", 
                    evidence: ["Response was {status: 'ok'}"], 
                    failures: [], 
                    requiredFixes: [] 
                });
            }
        } 
        else if (request.systemPrompt.includes("developer")) {
            if (this.attempt === 0) {
                mockContent = JSON.stringify({ 
                    status: "COMPLETED", 
                    message: "Wrote broken code", 
                    toolCalls: [{ tool: "write_file", args: { path: "api.js", content: "console.log('{status: error}');" } }] 
                });
            } else {
                mockContent = JSON.stringify({ 
                    status: "COMPLETED", 
                    message: "Fixed the code", 
                    toolCalls: [{ tool: "write_file", args: { path: "api.js", content: "console.log('{status: ok}');" } }] 
                });
            }
        } else {
            mockContent = JSON.stringify({ status: "COMPLETED", message: "Done" });
        }

        return {
            content: mockContent,
            model: modelId,
            durationMs: 100
        };
    }
}

async function main() {
    console.log("Initializing Agent Office - Failure & Recovery Demo...");

    const provider = new DeterministicFailureProvider();
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

    
    const testResultRepo = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo = new CodeReviewRepository();
    const checkpointRepo = new CheckpointRepository();
    const reviewer = new Reviewer(router, runRepo);
    const orchestrator = new Orchestrator(athena, ares, apollo, reviewer, workerFactory, projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo, artifactChangeRepo, codeReviewRepo, checkpointRepo, runRepo);
        

    const projectId = crypto.randomUUID();
    projectRepo.create({
        id: projectId,
        name: "Failure Recovery Demo",
        specification: "Create an API with a /health endpoint that returns {status: 'ok'}",
        successCriteria: "Returns 200 with {status: 'ok'}",
        currentPhase: "IDLE"
    });
    
    await orchestrator.runProject(projectId);
}

main().catch(console.error);
