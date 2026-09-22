export interface AgentResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    rawOutput?: string;
}
