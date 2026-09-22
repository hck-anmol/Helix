import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve("data/agent-office.db"),
    workspaceRoot: process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : path.resolve("projects"),
    models: {
        athena: "qwen3:8b",
        ares: "qwen3:8b",
        apollo: "qwen3:8b",
        developer: "qwen2.5-coder:7b",
        tester: "qwen2.5-coder:7b",
        researcher: "qwen3:4b"
    }
};
