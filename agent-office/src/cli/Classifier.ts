/**
 * Classifier — deterministic, zero-ML request classification.
 *
 * A request is a TASK if it contains action verbs ("write", "build", "create",
 * "implement", "generate", "make", "develop", "add", "fix", "refactor", etc.)
 * combined with artefact nouns ("file", "script", "api", "app", "function",
 * "class", "algorithm", "code", "program", "module", "server", "website", …).
 *
 * Everything else is treated as a QUESTION and answered directly via the LLM.
 * If classification is ambiguous, the default is TASK (conservative).
 */

export type RequestKind = "TASK" | "QUESTION";

// Verbs that clearly imply producing/modifying artefacts
const TASK_VERBS = [
    "write", "build", "create", "implement", "generate", "make", "develop",
    "add", "fix", "refactor", "code", "produce", "design", "setup", "set up",
    "scaffold", "bootstrap", "port", "migrate", "update", "extend", "integrate",
    "deploy", "install", "configure", "test", "benchmark", "optimise", "optimize"
];

// Nouns that imply output artefacts
const TASK_NOUNS = [
    "file", "script", "api", "app", "application", "function", "class",
    "algorithm", "code", "program", "module", "server", "website", "service",
    "library", "tool", "cli", "bot", "database", "schema", "endpoint",
    "interface", "component", "plugin", "extension", "implementation",
    "solution", "project", "system", "framework"
];

// Questions that are clearly informational
const QUESTION_PREFIXES = [
    "what is", "what are", "what does", "what do",
    "how does", "how do", "how is",
    "why is", "why are", "why does",
    "explain", "describe", "define", "tell me about",
    "difference between", "compare", "when to use",
    "can you explain", "could you explain"
];

export function classify(input: string): RequestKind {
    const lower = input.toLowerCase().trim();

    // Explicit question patterns → QUESTION
    for (const prefix of QUESTION_PREFIXES) {
        if (lower.startsWith(prefix) || lower.includes(prefix)) {
            // But override if there is also a strong artefact creation indicator
            const hasTaskVerb = TASK_VERBS.some(v => {
                const re = new RegExp(`\\b${v}\\b`);
                return re.test(lower);
            });
            const hasTaskNoun = TASK_NOUNS.some(n => {
                const re = new RegExp(`\\b${n}\\b`);
                return re.test(lower);
            });
            // "explain how to create a REST API and implement it" → still TASK
            if (hasTaskVerb && hasTaskNoun && !lower.startsWith(prefix)) {
                break;
            }
            return "QUESTION";
        }
    }

    // Has a task verb? Check for noun too.
    const hasTaskVerb = TASK_VERBS.some(v => {
        const re = new RegExp(`\\b${v}\\b`);
        return re.test(lower);
    });
    const hasTaskNoun = TASK_NOUNS.some(n => {
        const re = new RegExp(`\\b${n}\\b`);
        return re.test(lower);
    });

    if (hasTaskVerb && hasTaskNoun) return "TASK";
    if (hasTaskVerb) return "TASK"; // Verb alone is enough

    // Ends with "?" and no verb → QUESTION
    if (lower.endsWith("?")) return "QUESTION";

    // Default: TASK (conservative — rather build than ignore)
    return "TASK";
}
