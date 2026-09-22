import { ModelRequest, ModelResponse } from "./models";

export interface ModelProvider {
    generate(modelId: string, request: ModelRequest): Promise<ModelResponse>;
}
