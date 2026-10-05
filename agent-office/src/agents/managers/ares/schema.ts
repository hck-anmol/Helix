import { z } from "zod";

export const AresOutputSchema = z.object({
    type: z.literal("SCHEDULE"),
    contracts: z.array(z.object({
        issueId: z.string().optional(),
        receiver: z.enum(["developer", "tester", "researcher"]),
        contractType: z.literal("TASK"),
        objective: z.string(),
        acceptanceCriteria: z.array(z.string()),
        constraints: z.array(z.string())
    }))
});

export type AresOutput = z.infer<typeof AresOutputSchema>;
