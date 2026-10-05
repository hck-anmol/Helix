import { ExecutionContext } from "./ExecutionContext";
import crypto from "crypto";

export class ContextSerializer {
    static serialize(context: ExecutionContext): string {
        let output = "";
        
        output += `=== PROJECT ===\nName: ${context.project.name}\nSpec: ${(context.project.specification || "").trim()}\n\n`;
        
        if (context.milestone) {
            output += `=== MILESTONE ===\nTitle: ${context.milestone.title}\nDescription: ${context.milestone.description}\n\n`;
        }

        if (context.currentIssue) {
            output += `=== CURRENT ISSUE ===\nTitle: ${context.currentIssue.title}\nDescription: ${context.currentIssue.description}\n\n`;
        }

        if (context.dependencies && context.dependencies.length > 0) {
            output += `=== DEPENDENCIES ===\n`;
            for (const dep of context.dependencies) {
                output += `${dep.title} [${dep.status}]\n`;
            }
            output += "\n";
        }

        if (context.previousAttempts && context.previousAttempts.length > 0) {
            output += `=== PREVIOUS ATTEMPTS ===\n`;
            context.previousAttempts.forEach((attempt, index) => {
                output += `Attempt ${index + 1}: ${attempt.role} -> ${attempt.status}\n`;
                if (attempt.output) {
                    output += `Output/Summary: ${attempt.output}\n`;
                }
            });
            output += "\n";
        }

        if (context.recentCodeReviews && context.recentCodeReviews.length > 0) {
            output += `=== RECENT CODE REVIEWS ===\n`;
            for (const review of context.recentCodeReviews) {
                output += `Status: ${review.status}\nSummary: ${review.summary}\n`;
                for (const finding of review.findings) {
                    output += `- [${finding.severity}] ${finding.file}: ${finding.message} (Fix: ${finding.requiredFix})\n`;
                }
            }
            output += "\n";
        }

        if (context.recentArtifactChanges && context.recentArtifactChanges.length > 0) {
            output += `=== RECENT ARTIFACT CHANGES ===\n`;
            for (const change of context.recentArtifactChanges) {
                output += `[${change.changeType}] ${change.path}\n`;
            }
            output += "\n";
        }

        if (context.recentTestResults && context.recentTestResults.length > 0) {
            output += `=== TEST RESULTS ===\n`;
            for (const result of context.recentTestResults) {
                output += `Command: ${result.command}\nStatus: ${result.status}\nExit Code: ${result.exitCode}\n`;
                if (result.status === "FAILED") {
                    output += `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}\n`;
                }
            }
            output += "\n";
        }

        if (context.verificationHistory && context.verificationHistory.length > 0) {
            output += `=== VERIFICATION HISTORY ===\n`;
            for (const v of context.verificationHistory) {
                output += `Attempt ${v.attemptNumber}: ${v.status}\n`;
                if (v.status === "FAIL") {
                    const failures = JSON.parse(v.failures || "[]");
                    const requiredFixes = JSON.parse(v.requiredFixes || "[]");
                    if (failures.length) output += `Failures: ${failures.join(", ")}\n`;
                    if (requiredFixes.length) output += `Required Fixes: ${requiredFixes.join(", ")}\n`;
                }
            }
            output += "\n";
        }
        
        return output.trim();
    }

    static hash(contextString: string): string {
        return crypto.createHash("sha256").update(contextString).digest("hex");
    }
}
