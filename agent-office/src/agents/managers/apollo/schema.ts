import { z } from "zod";

export const ApolloOutputSchema = z.object({
    type: z.literal("VERIFICATION"),
    status: z.enum(["PASS", "FAIL"]),
    evidence: z.array(z.string()),
    failures: z.array(z.string()),
    requiredFixes: z.array(z.string())
});

export type ApolloOutput = z.infer<typeof ApolloOutputSchema>;
