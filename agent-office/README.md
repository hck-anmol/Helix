# Agent Office

A multi-agent software development system inspired by "TheBotCompany: Self-Organizing Multi-agent Systems for Continuous Software Development".

## Architecture (Phase 2 - Failure/Recovery Loop)

```text
                    ┌──────────────┐
                    │     USER     │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │    ATHENA    │
                    │   STRATEGY   │
                    └──────┬───────┘
                           ↓
                       MILESTONE
                           ↓
                    ┌──────────────┐
                    │     ARES     │
                    │  EXECUTION   │
                    └──────┬───────┘
                           ↓
                       WORKERS
                           ↓
                    ┌──────────────┐
                    │    APOLLO    │
                    │ VERIFICATION │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ PASS / FAIL  │
                    └──────┬───────┘
                           │
                 ┌─────────┴─────────┐
                 ↓                   ↓
               PASS                FAIL
                 ↓                   ↓
        NEXT MILESTONE        CREATE FIX TASKS
                                     ↓
                                   ARES
                                     ↓
                                  WORKERS
                                     ↓
                                   APOLLO
```

## Features
- **Strict Role Boundaries**: Managers (Athena, Ares, Apollo) do not call each other. Coordination is handled entirely by the Orchestrator's State Machine.
- **Autonomous Tool Execution**: Workers have sandboxed shell and file capabilities.
- **SQLite Persistence**: All state, issues, and verification attempts are durably stored in `agent-office.db`.
- **Failure Recovery Loop**: If Apollo returns `FAIL`, the Orchestrator generates FIX issues and loops back to Ares to schedule developers with strict failure context.
- **Retry Limits**: Configurable max verification attempts (`MAX_VERIFICATION_ATTEMPTS = 3`) and issue fix attempts (`MAX_FIX_ATTEMPTS_PER_ISSUE = 2`).

## Commands

- `npm run demo`: Runs the standard successful execution demo.
- `npm run demo-failure`: Runs the deterministic failure and recovery loop demo.
- `npm run status`: Prints a CLI dashboard of the current project status, issues, worker states, and verification attempts.
- `npm test`: Runs repository and state machine tests.

## Prerequisites

1. Install Node.js (v20+).
2. Install and run [Ollama](https://ollama.ai/).
3. Pull the required models:
   ```powershell
   ollama pull qwen3:8b
   ollama pull qwen2.5-coder:7b
   ollama pull qwen3:4b
   ```

## Setup

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Compile TypeScript:
   ```powershell
   npx tsc
   ```
