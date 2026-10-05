/**
 * Renderer — all terminal output is centralised here.
 *
 * Design goals:
 *  - Work in Windows PowerShell / Terminal (ANSI via chalk@4 CommonJS).
 *  - Degrade gracefully when ANSI is unavailable (NO_COLOR or not a TTY).
 *  - Never import the orchestration engine; it only formats strings.
 *  - Uses log-update pattern: write lines, re-render on interval.
 *    For simplicity (Windows compat) we use readline cursor movement
 *    rather than a third-party blessed/ink dependency.
 */

// chalk@4 is CommonJS — must use require() with ts-node
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require("chalk") as typeof import("chalk");

const USE_COLOR = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const USE_EMOJI = process.stdout.isTTY && process.platform !== undefined;

// ─── Unicode / emoji fallback ──────────────────────────────────────────────
export function emoji(e: string, fallback: string): string {
    return USE_EMOJI ? e : fallback;
}

// ─── Colour helpers ─────────────────────────────────────────────────────────
export const c = {
    cyan:   (s: string) => USE_COLOR ? chalk.cyan(s)   : s,
    green:  (s: string) => USE_COLOR ? chalk.green(s)  : s,
    yellow: (s: string) => USE_COLOR ? chalk.yellow(s) : s,
    red:    (s: string) => USE_COLOR ? chalk.red(s)    : s,
    gray:   (s: string) => USE_COLOR ? chalk.gray(s)   : s,
    bold:   (s: string) => USE_COLOR ? chalk.bold(s)   : s,
    white:  (s: string) => USE_COLOR ? chalk.white(s)  : s,
    dim:    (s: string) => USE_COLOR ? chalk.dim(s)    : s,
    blue:   (s: string) => USE_COLOR ? chalk.blue(s)   : s,
    magenta:(s: string) => USE_COLOR ? chalk.magenta(s): s,
};

// ─── Box drawing ─────────────────────────────────────────────────────────────
export function box(lines: string[], width = 62): string {
    const top    = "╔" + "═".repeat(width) + "╗";
    const bottom = "╚" + "═".repeat(width) + "╝";
    const padded = lines.map(l => {
        const stripped = stripAnsi(l);
        const pad = Math.max(0, width - stripped.length);
        return "║" + l + " ".repeat(pad) + "║";
    });
    return [top, ...padded, bottom].join("\n");
}

// Simple ANSI stripping for length calculations
export function stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function progressBar(pct: number, width = 30): string {
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * width);
    const empty  = width - filled;
    const bar = c.green("█".repeat(filled)) + c.gray("░".repeat(empty));
    return `${bar} ${String(Math.round(clamped)).padStart(3)}%`;
}

// ─── Status icons ─────────────────────────────────────────────────────────────
export function statusIcon(status: string): string {
    switch (status.toUpperCase()) {
        case "COMPLETED": case "VERIFIED": case "RESOLVED": case "PASS":
            return c.green(emoji("✓", "OK"));
        case "RUNNING": case "EXECUTING": case "CLAIMED":
            return c.cyan(emoji("●", "*"));
        case "FAILED": case "FAIL":
            return c.red(emoji("✗", "X"));
        case "WAITING": case "PENDING": case "READY":
            return c.gray(emoji("○", "-"));
        case "BLOCKED":
            return c.yellow(emoji("⊘", "B"));
        case "INTERRUPTED":
            return c.yellow(emoji("⚡", "!"));
        default:
            return c.gray(emoji("○", "-"));
    }
}

// ─── Banner ──────────────────────────────────────────────────────────────────
export function renderBanner(): string {
    return box([
        c.bold(c.cyan(`   ${emoji("🏢", "[AO]")} AGENT OFFICE`)),
        c.gray(`       Autonomous Development System`),
    ]);
}

// ─── Header line ─────────────────────────────────────────────────────────────
export function renderHeader(projectName: string, projectId: string): string {
    return [
        c.bold(c.cyan(`${emoji("🏢", "")} AGENT OFFICE`)),
        `  Project : ${c.white(projectName)}`,
        `  ID      : ${c.dim(projectId)}`,
    ].join("\n");
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function divider(width = 62): string {
    return c.dim("─".repeat(width));
}

// ─── Duration formatter ───────────────────────────────────────────────────────
export function formatDuration(ms: number): string {
    const secs  = Math.floor(ms / 1000);
    const mins  = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m ${secs % 60}s`;
    if (mins > 0)  return `${mins}m ${secs % 60}s`;
    return `${secs}s`;
}

// ─── Timestamp ──────────────────────────────────────────────────────────────
export function fmtTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toTimeString().slice(0, 8);
    } catch {
        return "??:??:??";
    }
}

// ─── Role display ────────────────────────────────────────────────────────────
export function roleEmoji(role: string): string {
    switch (role.toLowerCase()) {
        case "athena":   return emoji("🧠", "[ATH]");
        case "ares":     return emoji("⚙️ ", "[ARE]");
        case "apollo":   return emoji("🛡️ ", "[APO]");
        case "reviewer": return emoji("🔍", "[REV]");
        case "developer":return emoji("👨💻", "[DEV]");
        case "tester":   return emoji("🧪", "[TST]");
        default:         return emoji("🤖", `[${role.slice(0,3).toUpperCase()}]`);
    }
}

// ─── Print & clear helpers ────────────────────────────────────────────────────
export function println(line = ""): void {
    process.stdout.write(line + "\n");
}

export function clearScreen(): void {
    if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2J\x1b[H");
    }
}

export function moveCursorUp(n: number): void {
    if (process.stdout.isTTY && n > 0) {
        process.stdout.write(`\x1b[${n}A`);
    }
}

export function eraseLine(): void {
    if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2K\r");
    }
}

export function hideCursor(): void {
    if (process.stdout.isTTY) process.stdout.write("\x1b[?25l");
}

export function showCursor(): void {
    if (process.stdout.isTTY) process.stdout.write("\x1b[?25h");
}

// ─── Answer box ──────────────────────────────────────────────────────────────
export function renderAnswerBox(answer: string): string {
    return [
        box([`  ${emoji("💬", "[ANSWER]")} ${c.bold("ANSWER")}`]),
        "",
        answer,
        "",
    ].join("\n");
}

// ─── Final summary box ───────────────────────────────────────────────────────
export function renderSuccessBox(label: string): string {
    return box([`   ${emoji("✅", "[DONE]")} ${c.bold(c.green(label))}`]);
}

export function renderFailureBox(label: string): string {
    return box([`   ${emoji("❌", "[FAIL]")} ${c.bold(c.red(label))}`]);
}
