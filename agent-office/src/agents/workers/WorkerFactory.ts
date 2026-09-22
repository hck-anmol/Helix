import { Worker } from "./Worker";
import { ModelRouter } from "../../llm/ModelRouter";
import { AgentRunRepository } from "../../persistence/repositories/AgentRunRepository";
import { Tool } from "../../tools/Tool";
import { config } from "../../config/config";

export class WorkerFactory {
    constructor(
        private router: ModelRouter,
        private runRepo: AgentRunRepository,
        private availableTools: Tool[]
    ) {}

    createWorker(role: keyof typeof config.models, task: string): Worker {
        // Simple permission assignment based on role
        let allowedTools: Tool[] = [];
        if (role === "developer") {
            allowedTools = this.availableTools.filter(t => ["read_file", "write_file", "list_files", "execute_shell"].includes(t.name));
        } else if (role === "tester") {
            allowedTools = this.availableTools.filter(t => ["read_file", "write_file", "execute_shell"].includes(t.name));
        } else {
            allowedTools = this.availableTools.filter(t => ["read_file", "list_files"].includes(t.name));
        }
        return new Worker(role, task, allowedTools, this.router, this.runRepo);
    }
}
