import { ModelProvider } from "./ModelProvider";
import { ModelRequest, ModelResponse } from "./models";
import { config } from "../config/config";

export class ModelRouter {
    constructor(private readonly provider: ModelProvider) {}

    async route(role: keyof typeof config.models, request: ModelRequest): Promise<ModelResponse> {
        const modelId = config.models[role];
        if (!modelId) {
            throw new Error(`No model mapped for role: ${role}`);
        }
        return this.provider.generate(modelId, request);
    }
}
