import { BaseAgent } from "../../base/BaseAgent";
import { AgentContext } from "../../base/AgentContext";
import { ReviewerOutput, ReviewerOutputSchema } from "./schema";
import { REVIEWER_SYSTEM_PROMPT } from "./prompt";
import { ModelRouter } from "../../../llm/ModelRouter";
import { AgentRunRepository } from "../../../persistence/repositories/AgentRunRepository";
import crypto from "crypto";

export class Reviewer extends BaseAgent<ReviewerOutput> {
    constructor(router: ModelRouter, runRepo: AgentRunRepository) {
        super(crypto.randomUUID(), "reviewer", router, runRepo);
    }

    getSystemPrompt(context: AgentContext): string {
        const strictEnforcement = `\n\nCRITICAL: Your output MUST strictly match the Reviewer JSON schema exactly.\n- "status" must be EXACTLY the string "PASS" or the string "FAIL".\n- INVALID values: "success", "pass", "fail", "COMPLETED", "OK", true, false, or any other value.\n- "summary" must be a non-empty string.\n- "findings" must be a JSON array ([] if empty).\n- Return ONLY the raw JSON object. No markdown. No explanation.`;
        return context.historicalContext ? `${REVIEWER_SYSTEM_PROMPT}\n\n${context.historicalContext}${strictEnforcement}` : REVIEWER_SYSTEM_PROMPT + strictEnforcement;
    }

    parseResponse(response: string): ReviewerOutput {
        try {
            const startIdx = response.indexOf('{');
            const endIdx = response.lastIndexOf('}');
            if (startIdx === -1 || endIdx === -1) {
                throw new Error("No JSON object found in response");
            }
            const jsonStr = response.substring(startIdx, endIdx + 1);
            const raw = JSON.parse(jsonStr);

            // ── Normalize status ─────────────────────────────────────────────
            // Model sometimes returns "pass", "PASS", "success", "ok", true, etc.
            if (typeof raw.status === "string") {
                const s = raw.status.trim().toUpperCase();
                if (s === "PASS" || s === "SUCCESS" || s === "OK" || s === "COMPLETED" || s === "APPROVED") {
                    raw.status = "PASS";
                } else if (s === "FAIL" || s === "FAILED" || s === "REJECTED" || s === "ERROR") {
                    raw.status = "FAIL";
                }
            } else if (typeof raw.status === "boolean") {
                raw.status = raw.status ? "PASS" : "FAIL";
            }

            // ── Normalize summary (only if absent/undefined, not if wrong type) ────
            if (raw.summary === undefined || raw.summary === null) {
                raw.summary = raw.comment || raw.notes || raw.message || raw.description || "";
            }

            // ── Normalize findings (only if absent/undefined) ─────────────────
            if (raw.findings === undefined || raw.findings === null) {
                if (raw.issues && Array.isArray(raw.issues)) {
                    raw.findings = raw.issues;
                } else {
                    raw.findings = [];
                }
            } else if (!Array.isArray(raw.findings) && typeof raw.findings === "object") {
                // findings is an object keyed by finding name — convert values to array
                raw.findings = Object.values(raw.findings);
            }

            // Normalize each finding item — ensure severity and message exist
            raw.findings = raw.findings.map((f: any) => {
                if (typeof f === "string") {
                    return { severity: "INFO", message: f };
                }
                const normalized: any = { ...f };
                // Normalize severity
                if (typeof normalized.severity === "string") {
                    const sev = normalized.severity.trim().toUpperCase();
                    if (["CRITICAL","HIGH","MEDIUM","LOW","INFO"].includes(sev)) {
                        normalized.severity = sev;
                    } else {
                        normalized.severity = "INFO";
                    }
                } else {
                    normalized.severity = "INFO";
                }
                // Normalize message
                if (!normalized.message) {
                    normalized.message = normalized.description || normalized.detail || normalized.text || "No message";
                }
                return normalized;
            });

            return ReviewerOutputSchema.parse(raw);
        } catch (error) {
            throw new Error(`Reviewer output validation failed: ${error}`);
        }
    }
}
