/**
 * Dashboard — live terminal display that redraws itself every N ms.
 *
 * Uses ANSI cursor-up to overwrite its own previous output, keeping
 * the terminal clean without requiring blessed/ink.
 *
 * Windows PowerShell / Terminal compatible.
 */

import { DashboardState, computeProgress } from "./DashboardState";
import {
    c, emoji, progressBar, statusIcon, roleEmoji,
    fmtTime, formatDuration, divider, renderHeader,
    renderSuccessBox, renderFailureBox, println, stripAnsi
} from "./Renderer";

const REFRESH_MS = 500;

export class Dashboard {
    private lineCount = 0;  // how many lines we printed last frame
    private timer: ReturnType<typeof setInterval> | null = null;
    private latestState: DashboardState | null = null;
    private stopped = false;

    start(getState: () => DashboardState): void {
        // Draw first frame immediately
        this.draw(getState());
        this.timer = setInterval(() => {
            if (!this.stopped) {
                this.draw(getState());
            }
        }, REFRESH_MS);
    }

    update(state: DashboardState): void {
        this.latestState = state;
    }

    stop(): void {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Erase the previous frame and render new one. */
    private draw(state: DashboardState): void {
        this.eraseLastFrame();
        const frame = this.buildFrame(state);
        const lines = frame.split("\n");
        process.stdout.write(frame + "\n");
        this.lineCount = lines.length;
    }

    private eraseLastFrame(): void {
        if (!process.stdout.isTTY || this.lineCount === 0) return;
        // Move cursor up and clear each line
        for (let i = 0; i < this.lineCount; i++) {
            process.stdout.write("\x1b[1A\x1b[2K");
        }
    }

    private buildFrame(s: DashboardState): string {
        const cols = process.stdout.columns || 80;
        const lines: string[] = [];

        const push = (...l: string[]) => lines.push(...l);

        // ── Header ───────────────────────────────────────────────────────────
        push(renderHeader(s.projectName, s.projectId));
        push(divider(Math.min(cols - 2, 62)));

        // ── Overall Progress ─────────────────────────────────────────────────
        const pct = computeProgress(s.issues);
        const done  = s.issues.filter(i => ["RESOLVED", "VERIFIED"].includes(i.status)).length;
        const total = s.issues.length;
        push(`${c.bold("Progress:")}  ${progressBar(pct, 30)}  ${done}/${total} tasks`);
        push(`${c.bold("Phase   :")}  ${statusIcon(s.phase)} ${c.white(s.phase)}  ${c.dim("Runtime: " + formatDuration(s.elapsedMs))}`);
        push(divider(Math.min(cols - 2, 62)));

        // ── Agents ───────────────────────────────────────────────────────────
        if (s.agents.length > 0) {
            push(c.bold("Agents:"));
            for (const agent of s.agents) {
                const re  = roleEmoji(agent.role);
                const st  = statusIcon(agent.status);
                const dur = agent.durationMs ? c.dim(` (${agent.durationMs}ms)`) : "";
                const cnt = agent.runCount > 1 ? c.dim(` x${agent.runCount}`) : "";
                push(`  ${re} ${c.bold(agent.role.toUpperCase().padEnd(10))} ${st} ${agent.status}${dur}${cnt}`);
            }
            push(divider(Math.min(cols - 2, 62)));
        }

        // ── Task Board ───────────────────────────────────────────────────────
        if (s.issues.length > 0) {
            push(c.bold("Tasks:"));
            for (const issue of s.issues) {
                const icon = statusIcon(issue.status);
                const title = issue.title.length > 40
                    ? issue.title.slice(0, 37) + "..."
                    : issue.title;
                const fix = issue.fixAttempts > 0 ? c.yellow(` [fix #${issue.fixAttempts}]`) : "";
                push(`  ${icon} ${title}${fix}`);
            }
            push(divider(Math.min(cols - 2, 62)));
        }

        // ── Workers ──────────────────────────────────────────────────────────
        push(
            `${c.bold("Workers:")}  ` +
            `${c.green(emoji("✓", ""))}${s.workers.completed} done  ` +
            `${c.cyan(emoji("●", ""))}${s.workers.active} active  ` +
            `${c.red(emoji("✗", ""))}${s.workers.failed} failed`
        );

        // ── Tests / Review / Verification ─────────────────────────────────────
        const testLine = s.testsTotal > 0
            ? `${c.bold("Tests:")}    ${c.green(s.testsPassed + " passed")}  ${s.testsFailed > 0 ? c.red(s.testsFailed + " failed") : c.dim("0 failed")}`
            : `${c.bold("Tests:")}    ${c.dim("not started")}`;
        push(testLine);

        const revSt  = s.reviewStatus === "PASS" ? c.green("PASS")
            : s.reviewStatus === "FAIL" ? c.red("FAIL")
            : s.reviewStatus === "RUNNING" ? c.cyan("RUNNING")
            : c.dim("—");
        const apollSt = s.apolloStatus === "PASS" ? c.green("PASS")
            : s.apolloStatus === "FAIL" ? c.red("FAIL")
            : s.apolloStatus === "RUNNING" ? c.cyan("RUNNING")
            : c.dim("—");
        push(`${c.bold("Review:")}   ${revSt}   ${c.bold("Verification:")} ${apollSt}`);
        push(divider(Math.min(cols - 2, 62)));

        // ── Live events ───────────────────────────────────────────────────────
        if (s.recentEvents.length > 0) {
            push(c.bold("Activity:"));
            for (const ev of s.recentEvents.slice(-6)) {
                const t    = c.dim(fmtTime(ev.timestamp));
                const role = ev.role ? c.cyan(ev.role.padEnd(10)) : "          ";
                const msg  = ev.message || ev.eventType;
                const short = msg.length > 40 ? msg.slice(0, 37) + "..." : msg;
                push(`  ${t}  ${role}  ${c.dim(short)}`);
            }
            push(divider(Math.min(cols - 2, 62)));
        }

        // ── System status ────────────────────────────────────────────────────
        const ollama = s.ollamaConnected ? c.green(emoji("●", "OK")) + " CONNECTED" : c.red("OFFLINE");
        push(`Ollama: ${ollama}   DB: ${c.green(emoji("●", "OK"))} OK`);

        return lines.join("\n");
    }

    /** Render final summary (replaces the live dashboard). */
    renderFinalSummary(s: DashboardState, request: string): void {
        this.stop();
        this.eraseLastFrame();

        const lines: string[] = [];
        const push = (...l: string[]) => lines.push(...l);

        if (s.finalPhase === "COMPLETED") {
            push(renderSuccessBox("PROJECT COMPLETED"));
        } else {
            push(renderFailureBox("PROJECT FAILED / INCOMPLETE"));
        }

        push("");
        push(c.bold("Task:"));
        push(`  ${request}`);
        push("");
        push(`  ${c.bold("Status  :")} ${s.finalPhase === "COMPLETED" ? c.green("COMPLETED") : c.red("FAILED")}`);
        push(`  ${c.bold("Duration:")} ${formatDuration(s.elapsedMs)}`);
        push(`  ${c.bold("Agents  :")} ${s.agents.length}`);

        const done = s.issues.filter(i => ["RESOLVED", "VERIFIED"].includes(i.status)).length;
        push(`  ${c.bold("Tasks   :")} ${done}/${s.issues.length} completed`);

        if (s.testsTotal > 0) {
            push(`  ${c.bold("Tests   :")} ${c.green(s.testsPassed + " passed")}  ${s.testsFailed > 0 ? c.red(s.testsFailed + " failed") : ""}`);
        }
        push(`  ${c.bold("Review  :")} ${s.reviewStatus}`);
        push(`  ${c.bold("Verified:")} ${s.apolloStatus}`);

        if (s.artifactPaths.length > 0) {
            push("");
            push(c.bold("Generated Files:"));
            for (const p of s.artifactPaths) {
                push(`  ${c.green(emoji("✓", "OK"))} ${p}`);
            }
        }

        push("");
        push(`  ${c.bold("Project ID:")} ${c.dim(s.projectId)}`);
        push(`  Resume   : ${c.dim("npm run resume -- " + s.projectId)}`);
        push("");

        println(lines.join("\n"));
    }
}
