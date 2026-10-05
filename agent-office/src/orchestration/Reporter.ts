import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";
import { ArtifactChangeRepository } from "../persistence/repositories/ArtifactChangeRepository";
import { CodeReviewRepository } from "../persistence/repositories/CodeReviewRepository";

import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { AgentContractRepository } from "../persistence/repositories/AgentContractRepository";

import { ExecutionEventRepository } from "../observability/ExecutionEventRepository";

export class Reporter {
    constructor(
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private verificationRepo: VerificationRepository,
        private testResultRepo?: TestResultRepository,
        private artifactChangeRepo?: ArtifactChangeRepository,
        private codeReviewRepo?: CodeReviewRepository,
        private runRepo?: AgentRunRepository,
        private contractRepo?: AgentContractRepository,
        private executionEventRepo?: ExecutionEventRepository
    ) {}

    generateMilestoneReport(projectId: string, milestoneId: string) {
        const milestone = this.milestoneRepo.get(milestoneId);
        if (!milestone) return;

        const issues = this.issueRepo.listByMilestone(milestoneId);
        const verifications = this.verificationRepo.listByMilestone(milestoneId);

        let report = `# Milestone ${milestone.title}\n\n`;
        report += `Status: ${milestone.status}\n\n`;
        
        report += `## Issues:\n\n`;
        for (const issue of issues) {
            report += `### ${issue.id}\n`;
            report += `${issue.title}\n`;
            report += `Status: ${issue.status}\n`;
            report += `Attempts: ${issue.attemptCount}\n`;
            
            const deps = this.issueRepo.getDependencies(issue.id);
            if (deps.length > 0) {
                report += `Depends on: ${deps.join(", ")}\n`;
            }
            report += "\n";
        }

        if (this.artifactChangeRepo) {
            report += `\n## Artifact Changes\n\n`;
            const changes = this.artifactChangeRepo.listByMilestone(milestoneId);
            const created = changes.filter(c => c.changeType === "CREATED").map(c => `- ${c.path}`);
            const modified = changes.filter(c => c.changeType === "MODIFIED").map(c => `- ${c.path}`);
            const deleted = changes.filter(c => c.changeType === "DELETED").map(c => `- ${c.path}`);

            if (created.length > 0) report += `Created:\n${created.join("\n")}\n\n`;
            if (modified.length > 0) report += `Modified:\n${modified.join("\n")}\n\n`;
            if (deleted.length > 0) report += `Deleted:\n${deleted.join("\n")}\n\n`;
            if (changes.length === 0) report += `*No artifacts changed.*\n\n`;
        }

        if (this.codeReviewRepo) {
            report += `\n## Code Review\n\n`;
            const reviews = this.codeReviewRepo.listByMilestone(milestoneId);
            for (const review of reviews) {
                report += `### Status: ${review.status}\n`;
                report += `Summary: ${review.summary}\n`;
                report += `Files Reviewed: ${(review.filesReviewed || []).join(", ")}\n`;
                const findings = review.findings || [];
                const blocking = findings.filter((f: any) => f.severity === "CRITICAL" || f.severity === "HIGH").length;
                const suggestion = findings.length - blocking;
                report += `Blocking Findings: ${blocking}\n`;
                report += `Suggestions: ${suggestion}\n\n`;
            }
            if (reviews.length === 0) report += `*No code reviews performed.*\n\n`;
        }

        report += `\n## Tests Executed:\n\n`;
        if (this.testResultRepo) {
            const testRuns = this.testResultRepo.listByMilestone(milestoneId);
            for (const tr of testRuns) {
                report += `### Command: \`${tr.command}\`\n`;
                report += `Status: ${tr.status}\n`;
                report += `Exit Code: ${tr.exitCode}\n`;
                if (tr.stdout) report += `\n**STDOUT:**\n\`\`\`\n${tr.stdout.substring(0, 500)}${tr.stdout.length > 500 ? "..." : ""}\n\`\`\`\n`;
                if (tr.stderr) report += `\n**STDERR:**\n\`\`\`\n${tr.stderr.substring(0, 500)}${tr.stderr.length > 500 ? "..." : ""}\n\`\`\`\n`;
                report += "\n";
            }
            if (testRuns.length === 0) report += `*No tests executed.*\n\n`;
        }

        report += `\n## Verification attempts: ${verifications.length}\n\n`;
        
        verifications.forEach((v, idx) => {
            report += `### Attempt ${v.attemptNumber}:\n`;
            report += `${v.status}\n`;
            if (v.status === "FAIL") {
                try {
                    const failures = JSON.parse(v.failures);
                    report += `Failures:\n${failures.map((f: string) => "- " + f).join("\n")}\n`;
                    const fixes = JSON.parse(v.requiredFixes);
                    report += `Required Fixes:\n${fixes.map((f: string) => "- " + f).join("\n")}\n`;
                } catch (e) {}
            }
            report += "\n";
        });

        if (this.contractRepo) {
            report += `\n## Agent Contracts\n\n`;
            const contracts = this.contractRepo.listByMilestone(milestoneId);
            for (const contract of contracts) {
                report += `- [${contract.createdAt}] **${contract.contractType}** -> ${contract.receiver} (Status: ${contract.status})\n`;
                report += `  Objective: ${contract.objective}\n`;
                if (contract.resultStatus) {
                    report += `  Result: ${contract.resultStatus} (${contract.resultSummary})\n`;
                }
            }
            if (contracts.length === 0) report += `*No contracts created.*\n\n`;
        }

        if (this.runRepo) {
            report += `\n## Execution History\n\n`;
            const runs = this.runRepo.listByMilestone(milestoneId);
            for (const run of runs) {
                report += `- [${run.startedAt}] **${run.role}** (${run.phase}) -> ${run.status}\n`;
                if (run.duration) report += `  Duration: ${run.duration}ms\n`;
            }
        }

        if (this.executionEventRepo) {
            report += `\n## Observability Summary\n\n`;
            const events = this.executionEventRepo.listByMilestone(milestoneId);
            
            let totalAgentRuns = 0;
            let successfulAgentRuns = 0;
            let failedAgentRuns = 0;
            let totalToolExecutions = 0;
            let totalTestRuns = 0;
            let passedTests = 0;
            let failedTests = 0;
            let reviewerAttempts = 0;
            let reviewerFailures = 0;
            let totalExecutionDuration = 0;
            let checkpointRecoveryEvents = 0;

            for (const event of events) {
                if (event.eventType === "AGENT_STARTED") totalAgentRuns++;
                if (event.eventType === "AGENT_COMPLETED") successfulAgentRuns++;
                if (event.eventType === "AGENT_FAILED") failedAgentRuns++;
                if (event.eventType === "TOOL_STARTED") totalToolExecutions++;
                if (event.eventType === "TEST_STARTED") totalTestRuns++;
                if (event.eventType === "TEST_PASSED") passedTests++;
                if (event.eventType === "TEST_FAILED") failedTests++;
                if (event.eventType === "REVIEW_STARTED") reviewerAttempts++;
                if (event.eventType === "REVIEW_FAILED") reviewerFailures++;
                if (event.eventType === "CHECKPOINT_CREATED") checkpointRecoveryEvents++;
                if (event.eventType === "RESUME_STARTED") checkpointRecoveryEvents++;
                
                if (event.durationMs && (event.eventType === "AGENT_COMPLETED" || event.eventType === "AGENT_FAILED" || event.eventType === "TOOL_COMPLETED" || event.eventType === "OLLAMA_CALL_COMPLETED" || event.eventType === "OLLAMA_CALL_FAILED")) {
                    if (event.eventType.startsWith("AGENT_") || event.eventType.startsWith("TOOL_") || event.eventType.startsWith("OLLAMA_")) {
                        // avoid double counting? Let's just sum AGENT_ duration
                        if (event.eventType.startsWith("AGENT_")) {
                            totalExecutionDuration += event.durationMs;
                        }
                    }
                }
            }

            let interruptedAgentRuns = 0;
            if (this.runRepo) {
                const runs = this.runRepo.listByMilestone(milestoneId);
                interruptedAgentRuns = runs.filter((r: any) => r.status === "INTERRUPTED").length;
            }

            report += `- Total agent runs: ${totalAgentRuns}\n`;
            report += `- Successful agent runs: ${successfulAgentRuns}\n`;
            report += `- Failed agent runs: ${failedAgentRuns}\n`;
            report += `- Interrupted agent runs: ${interruptedAgentRuns}\n`;
            report += `- Total tool executions: ${totalToolExecutions}\n`;
            report += `- Total test runs: ${totalTestRuns}\n`;
            report += `- Passed tests: ${passedTests}\n`;
            report += `- Failed tests: ${failedTests}\n`;
            report += `- Reviewer attempts: ${reviewerAttempts}\n`;
            report += `- Reviewer failures: ${reviewerFailures}\n`;
            report += `- Total execution duration: ${totalExecutionDuration}ms\n`;
            report += `- Checkpoint/recovery events: ${checkpointRecoveryEvents}\n`;

            report += `\n## Observability Events\n\n`;
            for (const event of events) {
                report += `- [${event.timestamp}] **${event.eventType}** (Issue: ${event.issueId || 'N/A'})\n`;
                if (event.role) report += `  Role: ${event.role}\n`;
                if (event.status) report += `  Status: ${event.status}\n`;
                if (event.message) report += `  Message: ${event.message}\n`;
                if (event.durationMs) report += `  Duration: ${event.durationMs}ms\n`;
            }
            if (events.length === 0) report += `*No observability events recorded.*\n`;
        }

        report += `\nFinal result:\n${milestone.status}\n`;

        const reportsDir = path.join(config.workspaceRoot, projectId, "reports");
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportPath = path.join(reportsDir, `milestone-${milestoneId}.md`);
        fs.writeFileSync(reportPath, report, "utf-8");
        console.log(`[REPORTER] Milestone report generated: ${reportPath}`);
    }
}
