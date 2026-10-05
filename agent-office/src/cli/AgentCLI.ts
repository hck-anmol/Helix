/**
 * AgentCLI — top-level entry point for `npm run agent`.
 *
 * Responsibilities:
 *  1. Parse CLI arguments (--help, inline query, interactive mode)
 *  2. Classify request: QUESTION vs TASK
 *  3. For QUESTION: call Ollama directly and print the answer
 *  4. For TASK: create a project, start EventStream + Dashboard, run Orchestrator
 *  5. Handle Ctrl+C gracefully (print project ID for resume)
 *  6. Interactive REPL loop (multiple requests)
 */

import readline from "readline";
import crypto from "crypto";
import path from "path";
import fs from "fs";

import { config } from "../config/config";
import { classify } from "./Classifier";
import { EventStream } from "./EventStream";
import { Dashboard } from "./Dashboard";
import {
    c, emoji, renderBanner, renderAnswerBox, renderSuccessBox, renderFailureBox,
    println, divider
} from "./Renderer";

// ── Existing engine imports ──────────────────────────────────────────────────
import { OllamaProvider } from "../llm/OllamaProvider";
import { ModelRouter } from "../llm/ModelRouter";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { Athena } from "../agents/managers/athena/Athena";
import { Ares } from "../agents/managers/ares/Ares";
import { Apollo } from "../agents/managers/apollo/Apollo";
import { WorkerFactory } from "../agents/workers/WorkerFactory";
import { Orchestrator } from "../orchestration/Orchestrator";
import { ReadFileTool, WriteFileTool, ListFilesTool, CopyTemplateTool } from "../tools/FileTools";
import { ShellTool } from "../tools/ShellTools";

// Dynamically required to avoid circular imports
const { TestResultRepository }     = require("../persistence/repositories/TestResultRepository");
const { ArtifactChangeRepository } = require("../persistence/repositories/ArtifactChangeRepository");
const { CodeReviewRepository }     = require("../persistence/repositories/CodeReviewRepository");
const { Reviewer }                 = require("../agents/managers/reviewer/Reviewer");

// ────────────────────────────────────────────────────────────────────────────

function buildHelp(): string {
    return [
        "",
        renderBanner(),
        "",
        c.bold("Usage:"),
        `  ${c.cyan("npm run agent")}                        Start interactive mode`,
        `  ${c.cyan('npm run agent -- "<request>"')}         Execute a request directly`,
        `  ${c.cyan("npm run agent -- --help")}              Show this help`,
        "",
        c.bold("Interactive commands:"),
        `  ${c.cyan("help")}    Show this help`,
        `  ${c.cyan("status")}  Show status of last project`,
        `  ${c.cyan("exit")}    Exit Agent Office`,
        `  ${c.cyan("quit")}    Exit Agent Office`,
        "",
        c.bold("Examples:"),
        `  > Write a Dijkstra algorithm in C++`,
        `  > Build a REST API with Node.js`,
        `  > What is the difference between TCP and UDP?`,
        "",
    ].join("\n");
}

// ── Singleton Orchestrator factory ────────────────────────────────────────────
function buildOrchestrator() {
    const provider   = new OllamaProvider(config.ollamaBaseUrl);
    const router     = new ModelRouter(provider);
    const projectRepo     = new ProjectRepository();
    const milestoneRepo   = new MilestoneRepository();
    const runRepo         = new AgentRunRepository();
    const issueRepo       = new IssueRepository();
    const verificationRepo = new VerificationRepository();
    const testResultRepo  = new TestResultRepository();
    const artifactChangeRepo = new ArtifactChangeRepository();
    const codeReviewRepo  = new CodeReviewRepository();
    const athena      = new Athena(router, runRepo);
    const ares        = new Ares(router, runRepo);
    const apollo      = new Apollo(router, runRepo);
    const reviewer    = new Reviewer(router, runRepo);
    const tools       = [new ReadFileTool(), new WriteFileTool(), new ListFilesTool(), new ShellTool(), new CopyTemplateTool()];
    const workerFactory = new WorkerFactory(router, runRepo, tools);
    return {
        orchestrator: new Orchestrator(
            athena, ares, apollo, reviewer, workerFactory,
            projectRepo, milestoneRepo, issueRepo, verificationRepo,
            testResultRepo, artifactChangeRepo, codeReviewRepo
        ),
        projectRepo, milestoneRepo, provider
    };
}

// ── Question handler ───────────────────────────────────────────────────────────
async function handleQuestion(query: string): Promise<void> {
    println(`\n${emoji("💬", "")} ${c.cyan("Thinking...")}`);
    try {
        const provider = new OllamaProvider(config.ollamaBaseUrl);
        const response = await provider.generate(config.models.athena, {
            systemPrompt: "You are a knowledgeable technical assistant. Answer the user's question clearly and concisely in plain text (no JSON). Do not fabricate information.",
            prompt: query,
            responseFormat: "text" as any
        });
        println(renderAnswerBox(response.content));
    } catch (err: any) {
        println(c.red(`\nError: ${err.message}`));
    }
}

// ── Task handler ───────────────────────────────────────────────────────────────
async function handleTask(request: string): Promise<string | null> {
    const { orchestrator, projectRepo } = buildOrchestrator();

    const projectId = crypto.randomUUID();
    const projectName = request.length > 50 ? request.slice(0, 47) + "..." : request;

    // Create project in DB
    projectRepo.create({
        id: projectId,
        name: projectName,
        specification: request,
        successCriteria: request,
        currentPhase: "IDLE"
    });

    // Ensure workspace dir
    const workspaceDir = path.join(config.workspaceRoot, projectId);
    fs.mkdirSync(workspaceDir, { recursive: true });

    // ── Setup live dashboard ────────────────────────────────────────────────
    const stream    = new EventStream(projectId, projectName);
    const dashboard = new Dashboard();

    // Suppress engine console output during dashboard mode (redirect to events)
    const originalLog   = console.log;
    const originalError = console.error;
    const originalWarn  = console.warn;
    if (process.stdout.isTTY) {
        console.log   = () => {};
        console.error = () => {};
        console.warn  = () => {};
    }

    println(""); // blank line before dashboard
    stream.start();
    dashboard.start(() => stream.getState());

    // ── Ctrl+C handler ─────────────────────────────────────────────────────
    let interrupted = false;
    const sigintHandler = () => {
        interrupted = true;
        dashboard.stop();
        stream.stop();
        console.log   = originalLog;
        console.error = originalError;
        console.warn  = originalWarn;
        println("");
        println(c.yellow(`\n${emoji("⚡", "!")} Project interrupted.`));
        println(`  Project ID : ${c.bold(projectId)}`);
        println(`  Resume with: ${c.cyan("npm run resume -- " + projectId)}`);
        println("");
        process.exit(0);
    };
    process.once("SIGINT", sigintHandler);

    try {
        await orchestrator.runProject(projectId);
    } finally {
        process.removeListener("SIGINT", sigintHandler);
    }

    // Final poll to get latest state
    await new Promise(r => setTimeout(r, 600));
    stream.stop();
    dashboard.stop();

    // Restore console
    console.log   = originalLog;
    console.error = originalError;
    console.warn  = originalWarn;

    // Render final summary
    const finalState = stream.getState();
    dashboard.renderFinalSummary(finalState, request);

    return projectId;
}

// ── Interactive loop ───────────────────────────────────────────────────────────
async function interactiveLoop(): Promise<void> {
    println(renderBanner());
    println(c.dim("Type your request, or 'help' / 'exit'"));
    println("");

    let lastProjectId: string | null = null;

    const rl = readline.createInterface({
        input:  process.stdin,
        output: process.stdout,
        terminal: true
    });

    // Handle Ctrl+C in interactive mode
    rl.on("SIGINT", () => {
        println("\n" + c.dim("Goodbye!"));
        rl.close();
        process.exit(0);
    });

    const prompt = () => {
        rl.question(`\n${c.bold(c.cyan("AGENT OFFICE"))} ${c.gray(">")} `, async (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                prompt();
                return;
            }

            // ── Built-in commands ───────────────────────────────────────────
            if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
                println(c.dim("\nGoodbye!"));
                rl.close();
                process.exit(0);
            }

            if (trimmed.toLowerCase() === "help") {
                println(buildHelp());
                prompt();
                return;
            }

            if (trimmed.toLowerCase() === "status") {
                if (lastProjectId) {
                    println(c.dim(`\nLast project: ${lastProjectId}`));
                    println(c.dim(`npm run status ${lastProjectId}`));
                } else {
                    println(c.dim("No project yet."));
                }
                prompt();
                return;
            }

            // ── Classify and dispatch ───────────────────────────────────────
            const kind = classify(trimmed);
            println(c.dim(`\nClassified as: ${kind}`));

            if (kind === "QUESTION") {
                await handleQuestion(trimmed);
            } else {
                lastProjectId = await handleTask(trimmed);
            }

            prompt();
        });
    };

    prompt();
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function main(argv: string[]): Promise<void> {
    const args = argv.slice(2); // strip "node" + script

    if (args.includes("--help") || args.includes("-h")) {
        println(buildHelp());
        return;
    }

    // Inline query: npm run agent -- "..."
    const inlineArgs = args.filter(a => !a.startsWith("--"));
    if (inlineArgs.length > 0) {
        const query = inlineArgs.join(" ");
        const kind = classify(query);
        println(c.dim(`Classified as: ${kind}`));
        if (kind === "QUESTION") {
            await handleQuestion(query);
        } else {
            await handleTask(query);
        }
        return;
    }

    // Interactive mode
    await interactiveLoop();
}

// ── Script entry ──────────────────────────────────────────────────────────────
if (require.main === module) {
    main(process.argv).catch(err => {
        console.error(c.red("Fatal error:"), err.message);
        process.exit(1);
    });
}
