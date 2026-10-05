export interface ExecutionEvent {
    id: string;
    projectId: string;
    milestoneId?: string;
    issueId?: string;
    contractId?: string;
    agentRunId?: string;

    timestamp: string;

    eventType:
        | "PROJECT_STARTED"
        | "PROJECT_COMPLETED"
        | "PROJECT_FAILED"
        | "PROJECT_RESUMED"
        | "MILESTONE_STARTED"
        | "MILESTONE_COMPLETED"
        | "MILESTONE_FAILED"
        | "ISSUE_CREATED"
        | "ISSUE_READY"
        | "ISSUE_BLOCKED"
        | "ISSUE_CLAIMED"
        | "ISSUE_STARTED"
        | "ISSUE_COMPLETED"
        | "ISSUE_FAILED"
        | "ISSUE_REOPENED"
        | "CONTRACT_CREATED"
        | "CONTRACT_STARTED"
        | "CONTRACT_COMPLETED"
        | "CONTRACT_FAILED"
        | "AGENT_STARTED"
        | "AGENT_COMPLETED"
        | "AGENT_FAILED"
        | "TOOL_STARTED"
        | "TOOL_COMPLETED"
        | "TOOL_FAILED"
        | "REVIEW_STARTED"
        | "REVIEW_PASSED"
        | "REVIEW_FAILED"
        | "TEST_STARTED"
        | "TEST_PASSED"
        | "TEST_FAILED"
        | "VERIFICATION_STARTED"
        | "VERIFICATION_PASSED"
        | "VERIFICATION_FAILED"
        | "FIX_CREATED"
        | "RETRY_STARTED"
        | "CHECKPOINT_CREATED"
        | "RESUME_STARTED"
        | "DEADLOCK_DETECTED"
        | "EXECUTION_FAILED"
        | "OLLAMA_CALL_STARTED"
        | "OLLAMA_CALL_COMPLETED"
        | "OLLAMA_CALL_FAILED";

    role?: string;
    model?: string;

    durationMs?: number;

    status?: string;

    message?: string;

    metadata?: Record<string, unknown>;
}
