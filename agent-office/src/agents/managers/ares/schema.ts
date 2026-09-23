import { z } from "zod";

export const AresOutputSchema = z.object({
    type: z.literal("SCHEDULE"),
    tasks: z.array(z.object({
        issueId: z.string(),
        workerRole: z.enum(["developer", "tester", "researcher"]),
        task: z.string()
    }))
});

export type AresOutput = z.infer<typeof AresOutputSchema>;
