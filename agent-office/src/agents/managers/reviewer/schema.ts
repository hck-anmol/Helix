import { z } from "zod";

export const ReviewerOutputSchema = z.object({
    status: z.enum(["PASS", "FAIL"]),
    summary: z.string(),
    findings: z.array(z.object({
        severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
        file: z.string().optional(),
        line: z.number().optional(),
        message: z.string(),
        requiredFix: z.string().optional()
    }))
});

export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;
