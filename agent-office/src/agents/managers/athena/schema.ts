import { z } from "zod";

export const AthenaOutputSchema = z.object({
    type: z.literal("MILESTONE"),
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()),
    budget: z.number(),
    suggestedTasks: z.array(z.object({
        title: z.string(),
        type: z.string()
    })).optional()
});

export type AthenaOutput = z.infer<typeof AthenaOutputSchema>;
