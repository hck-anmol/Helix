# Agent Office - 30% Foundation

A foundational implementation of a multi-agent software development system inspired by "TheBotCompany: Self-Organizing Multi-agent Systems for Continuous Software Development".

## Architecture

This project implements a local, Ollama-based architecture:

- **Managers**: `Athena` (Strategy), `Ares` (Execution), `Apollo` (Verification).
- **Workers**: `developer`, `tester`, `researcher` dynamically created with specific tools.
- **Orchestration**: `Orchestrator` manages a strict lifecycle (`STRATEGY` -> `EXECUTION` -> `VERIFICATION`) driven by a State Machine.
- **Persistence**: SQLite (using `better-sqlite3`) tracks projects, milestones, and agent runs.
- **LLM**: All calls are routed through `ModelRouter` to an `OllamaProvider`. 

## Prerequisites

1. Install Node.js (v20+).
2. Install and run [Ollama](https://ollama.ai/).
3. Pull the required models:
   ```powershell
   ollama pull qwen3:8b
   ollama pull qwen2.5-coder:7b
   ollama pull qwen3:4b
   ```

## Setup and Execution

1. Navigate to the project directory:
   ```powershell
   cd D:\Helix\agent-office
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Compile TypeScript:
   ```powershell
   npx tsc
   ```
4. Run the Demo:
   ```powershell
   npm run demo
   ```

The demo simulates the creation of a simple REST API with a `/health` endpoint, passing it through the full Strategy -> Execution -> Verification lifecycle.
