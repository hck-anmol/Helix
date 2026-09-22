import { z } from "zod";

export const AresOutputSchema = z.object({
    type: z.literal("SCHEDULE"),
    workers: z.array(z.object({
        role: z.enum(["developer", "tester", "researcher"]),
        task: z.string()
    }))
});

export type AresOutput = z.infer<typeof AresOutputSchema>;
