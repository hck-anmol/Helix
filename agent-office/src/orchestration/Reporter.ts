import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";

export class Reporter {
    constructor(
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private verificationRepo: VerificationRepository,
        private testResultRepo?: TestResultRepository
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

        report += `Final result:\n${milestone.status}\n`;

        const reportsDir = path.join(config.workspaceRoot, projectId, "reports");
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportPath = path.join(reportsDir, `milestone-${milestoneId}.md`);
        fs.writeFileSync(reportPath, report, "utf-8");
        console.log(`[REPORTER] Milestone report generated: ${reportPath}`);
    }
}
