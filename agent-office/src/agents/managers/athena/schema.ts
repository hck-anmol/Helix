import { z } from "zod";

export const AthenaOutputSchema = z.object({
    type: z.literal("MILESTONE"),
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()),
    budget: z.number()
});

export type AthenaOutput = z.infer<typeof AthenaOutputSchema>;
