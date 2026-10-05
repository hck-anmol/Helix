import { z } from "zod";

// Lenient individual finding — severity defaults to INFO, message required
const FindingSchema = z.object({
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]).default("INFO"),
    file: z.string().optional(),
    line: z.number().optional(),
    message: z.string().default("No message provided"),
    requiredFix: z.string().optional()
});

export const ReviewerOutputSchema = z.object({
    status: z.enum(["PASS", "FAIL"]),
    summary: z.string().default(""),
    findings: z.array(FindingSchema).default([])
});

export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;
