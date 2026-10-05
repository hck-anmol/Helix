import { z } from "zod";
import { config } from "../config/config";

const RoleSchema = z.enum(["orchestrator", ...Object.keys(config.models)] as [string, ...string[]]);

export const AgentContractSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string(),
    milestoneId: z.string(),
    issueId: z.string().optional(),
    
    sender: RoleSchema,
    receiver: RoleSchema,
    
    contractType: z.enum(["TASK", "REVIEW", "TEST", "VERIFICATION", "FIX"]),
    objective: z.string(),
    inputs: z.record(z.any()).default({}),
    acceptanceCriteria: z.array(z.string()).default([]),
    constraints: z.array(z.string()).default([]),
    
    contextHash: z.string().optional(),
    status: z.enum(["CREATED", "READY", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"]),
    
    resultStatus: z.string().optional(),
    resultSummary: z.string().optional(),
    resultPayload: z.record(z.any()).optional(),
    
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().optional()
});

export type AgentContract = z.infer<typeof AgentContractSchema>;
