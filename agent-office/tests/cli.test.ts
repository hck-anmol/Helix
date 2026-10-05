/**
 * CLI test suite — fully deterministic, no real Ollama required.
 *
 * Covers:
 *  - classify()
 *  - computeProgress()
 *  - progressBar rendering
 *  - formatDuration
 *  - initialState
 */

import assert from "assert";
import { classify } from "../src/cli/Classifier";
import { computeProgress, initialState, IssueRow } from "../src/cli/DashboardState";
import { progressBar, formatDuration, stripAnsi } from "../src/cli/Renderer";

function eq(a: any, b: any, label = "") {
    assert.deepStrictEqual(a, b, label || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export async function run() {
    // ── Classifier ──────────────────────────────────────────────────────────
    eq(classify("What is TCP?"), "QUESTION", "plain question → QUESTION");
    eq(classify("Explain polymorphism in C++"), "QUESTION", "explain → QUESTION");
    eq(classify("What is a mutex?"), "QUESTION", "what is → QUESTION");
    eq(classify("How does TCP work?"), "QUESTION", "how does → QUESTION");
    eq(classify("Write Dijkstra algorithm in C++"), "TASK", "write + noun → TASK");
    eq(classify("Build a REST API with Node.js"), "TASK", "build → TASK");
    eq(classify("Implement binary search tree in Java"), "TASK", "implement → TASK");
    eq(classify("Create a React dashboard"), "TASK", "create → TASK");
    eq(classify("Generate a CLI tool in Python"), "TASK", "generate → TASK");
    eq(classify("Write a full implementation of Dijkstra's algorithm in C++"), "TASK", "long task → TASK");
    eq(classify("Fix the bug in the auth module"), "TASK", "fix → TASK");
    eq(classify("Refactor the database schema"), "TASK", "refactor → TASK");
    console.log("Classifier tests passed!");

    // ── computeProgress ─────────────────────────────────────────────────────
    eq(computeProgress([]), 0, "empty → 0");
    const pending: IssueRow[] = [
        { id: "1", title: "A", status: "PENDING",  type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
        { id: "2", title: "B", status: "READY",    type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
    ];
    eq(computeProgress(pending), 0, "all pending → 0");

    const half: IssueRow[] = [
        { id: "1", title: "A", status: "RESOLVED", type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
        { id: "2", title: "B", status: "PENDING",  type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
    ];
    eq(computeProgress(half), 50, "half resolved → 50");

    const all: IssueRow[] = [
        { id: "1", title: "A", status: "RESOLVED", type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
        { id: "2", title: "B", status: "VERIFIED", type: "TASK", priority: "MEDIUM", fixAttempts: 0 },
    ];
    eq(computeProgress(all), 100, "all resolved → 100");
    console.log("computeProgress tests passed!");

    // ── progressBar ─────────────────────────────────────────────────────────
    assert(stripAnsi(progressBar(0,   10)).includes("0%"),   "progressBar 0%");
    assert(stripAnsi(progressBar(100, 10)).includes("100%"), "progressBar 100%");
    assert(stripAnsi(progressBar(-10, 10)).includes("0%"),   "progressBar clamp negative");
    assert(stripAnsi(progressBar(150, 10)).includes("100%"), "progressBar clamp over 100");
    console.log("progressBar tests passed!");

    // ── formatDuration ───────────────────────────────────────────────────────
    eq(formatDuration(0),       "0s",       "0ms → 0s");
    eq(formatDuration(5000),    "5s",       "5000ms → 5s");
    eq(formatDuration(90000),   "1m 30s",   "90000ms → 1m 30s");
    eq(formatDuration(3661000), "1h 1m 1s", "3661000ms → 1h 1m 1s");
    console.log("formatDuration tests passed!");

    // ── initialState ─────────────────────────────────────────────────────────
    const s = initialState("proj-1", "Test Project");
    eq(s.projectId,   "proj-1",       "projectId");
    eq(s.projectName, "Test Project", "projectName");
    eq(s.phase,       "PLANNED",      "phase");
    eq(s.issues.length, 0,            "empty issues");
    eq(s.agents.length, 0,            "empty agents");
    eq(s.finalPhase,  undefined,      "no finalPhase");
    console.log("initialState tests passed!");

    console.log("CLI tests passed! ✅");
}
