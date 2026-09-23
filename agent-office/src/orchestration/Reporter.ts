import fs from "fs";
import path from "path";
import { config } from "../config/config";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";

export class Reporter {
    constructor(
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private verificationRepo: VerificationRepository
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
