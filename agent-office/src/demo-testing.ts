import { Orchestrator } from "./orchestration/Orchestrator";
import { Athena } from "./agents/managers/athena/Athena";
import { Ares } from "./agents/managers/ares/Ares";
import { Apollo } from "./agents/managers/apollo/Apollo";
import { WorkerFactory } from "./agents/workers/WorkerFactory";
import { ProjectRepository } from "./persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "./persistence/repositories/MilestoneRepository";
import { IssueRepository } from "./persistence/repositories/IssueRepository";
import { VerificationRepository } from "./persistence/repositories/VerificationRepository";
import { TestResultRepository } from "./persistence/repositories/TestResultRepository";
import { AgentRunRepository } from "./persistence/repositories/AgentRunRepository";
import { ModelRouter } from "./llm/ModelRouter";
import { OllamaProvider } from "./llm/OllamaProvider";
import { config } from "./config/config";
import { ReadFileTool, WriteFileTool, ListFilesTool } from "./tools/FileTools";
import { ShellTool } from "./tools/ShellTools";
import crypto from "crypto";
import fs from "fs";
import path from "path";

async function main() {
    const provider = new OllamaProvider(config.ollamaBaseUrl);
    const modelRouter = new ModelRouter(provider);
    const runRepo = new AgentRunRepository();
    
    const athena = new Athena(modelRouter, runRepo);
    const ares = new Ares(modelRouter, runRepo);
    const apollo = new Apollo(modelRouter, runRepo);

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
    const testResultRepo = new TestResultRepository();

    const orchestrator = new Orchestrator(
        athena, ares, apollo, workerFactory,
        projectRepo, milestoneRepo, issueRepo, verificationRepo, testResultRepo
    );

    const projectId = crypto.randomUUID();
    projectRepo.create({
        id: projectId,
        name: "Health API",
        specification: "Build a Health API that returns the server status.",
        successCriteria: "API runs and returns 200 OK from /health",
        currentPhase: "PLANNED"
    });

    console.log(`[DEMO] Created Project: ${projectId}`);
    
    // Create project directory
    const projectDir = path.join(config.workspaceRoot, projectId);
    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }

    // Mock Athena
    athena.invoke = async () => ({
        success: true,
        data: {
            type: "MILESTONE",
            title: "Build Health API",
            description: "Implement Health API",
            budget: 10,
            acceptanceCriteria: ["Tests pass"],
            suggestedTasks: [
                { title: "ISSUE-001: Setup Server", type: "TASK" },
                { title: "ISSUE-002: Run tests", type: "TASK" }
            ]
        }
    });

    const originalCreate = issueRepo.create.bind(issueRepo);
    let createdIssues: any[] = [];
    issueRepo.create = (issue) => {
        originalCreate(issue);
        if (issue.title.startsWith("ISSUE-")) {
            createdIssues.push(issue);
            if (createdIssues.length === 2) {
                issueRepo.addDependency(createdIssues[1].id, createdIssues[0].id);
            }
        }
    };

    ares.invoke = async (prompt) => {
        const readyIssueMatch = prompt.match(/READY Issues:\n([\s\S]*?)\nProvide workers/);
        const tasks = [];
        if (readyIssueMatch && readyIssueMatch[1]) {
            const lines = readyIssueMatch[1].trim().split("\n");
            for (const line of lines) {
                const match = line.match(/- \[([^\]]+)\]/);
                if (match && match[1]) {
                    tasks.push({ issueId: match[1], workerRole: "developer" as any, task: "Execute" });
                }
            }
        }
        return { success: true, data: { type: "SCHEDULE", tasks } };
    };

    // Mock workers to actually write files and run tests
    const shellTool = new ShellTool();
    workerFactory.createWorker = (role, task) => {
        const workerId = crypto.randomUUID();
        return {
            id: workerId,
            executeTask: async (context: any) => {
                const issueId = context.currentIssueId;
                const issue = issueRepo.get(issueId)!;
                
                runRepo.create({
                    id: workerId,
                    projectId: context.projectId,
                    milestoneId: context.currentMilestoneId || "",
                    issueId,
                    agentId: workerId,
                    role: role,
                    model: "mock-model",
                    task: task,
                    phase: "EXECUTION",
                    status: "SUCCESS",
                    output: "mock output"
                });
                
                if (issue.title.includes("Setup Server")) {
                    // Create server.js
                    fs.writeFileSync(path.join(projectDir, "server.js"), "console.log('Server running');");
                    return { success: true, data: { status: "COMPLETED", message: "Server created" } };
                } else if (issue.title.includes("Run tests")) {
                    // Execute a test command
                    const mockContext = { projectId: context.projectId, workspaceRoot: projectDir, currentIssueId: issueId, currentMilestoneId: context.currentMilestoneId, projectSpec: "" };
                    const sr = await shellTool.execute({ command: "node server.js" }, mockContext);
                    return {
                        success: true,
                        data: {
                            status: "COMPLETED",
                            message: "Test executed",
                            testsRun: [{
                                command: sr.command,
                                status: sr.exitCode === 0 ? "PASSED" : "FAILED",
                                exitCode: sr.exitCode,
                                stdout: sr.stdout,
                                stderr: sr.stderr,
                                durationMs: sr.durationMs
                            }]
                        }
                    };
                }
                return { success: true, data: { status: "COMPLETED", message: "Task completed" } };
            }
        } as any;
    };

    // Mock Apollo to read tests
    apollo.invoke = async (prompt) => {
        const testEvidence = prompt.match(/Test Evidence:\n([\s\S]*)/)?.[1] || "";
        console.log("[DEMO-APOLLO] Seen Evidence:", testEvidence.trim());
        const pass = testEvidence.includes("Exit: 0");
        return {
            success: true,
            data: {
                type: "VERIFICATION",
                status: pass ? "PASS" : "FAIL",
                evidence: [testEvidence.trim()],
                failures: pass ? [] : ["Test failed"],
                requiredFixes: pass ? [] : ["Fix server"]
            }
        };
    };

    await orchestrator.runProject(projectId);
    console.log(`[DEMO] Complete. Check status!`);
}

main().catch(console.error);
