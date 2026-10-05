import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve("data/agent-office.db"),
    workspaceRoot: process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : path.resolve("projects"),
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || "2", 10),
    models: {
        athena: process.env.AGENT_MODEL_ATHENA || "qwen3:8b",
        ares: process.env.AGENT_MODEL_ARES || "qwen3:8b",
        apollo: process.env.AGENT_MODEL_APOLLO || "qwen3:8b",
        developer: process.env.AGENT_MODEL_DEVELOPER || "qwen3:8b",
        tester: process.env.AGENT_MODEL_TESTER || "qwen3:8b",
        researcher: process.env.AGENT_MODEL_RESEARCHER || "qwen3:8b",
        reviewer: process.env.AGENT_MODEL_REVIEWER || "qwen3:8b"
    }
};
