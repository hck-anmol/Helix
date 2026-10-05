import { ExecutionContext } from "./ExecutionContext";
import { ProjectRepository } from "../persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { AgentRunRepository } from "../persistence/repositories/AgentRunRepository";
import { CodeReviewRepository } from "../persistence/repositories/CodeReviewRepository";
import { ArtifactChangeRepository } from "../persistence/repositories/ArtifactChangeRepository";
import { TestResultRepository } from "../persistence/repositories/TestResultRepository";
import { VerificationRepository } from "../persistence/repositories/VerificationRepository";
import { Issue } from "../projects/Issue";

export interface ContextLimits {
    maxAgentRuns?: number;
    maxReviews?: number;
    maxTestResults?: number;
    maxArtifactChanges?: number;
    maxVerificationRuns?: number;
}

export class ContextBuilder {
    constructor(
        private projectRepo: ProjectRepository,
        private milestoneRepo: MilestoneRepository,
        private issueRepo: IssueRepository,
        private runRepo: AgentRunRepository,
        private reviewRepo: CodeReviewRepository,
        private artifactRepo: ArtifactChangeRepository,
        private testRepo: TestResultRepository,
        private verificationRepo: VerificationRepository
    ) {}

    build(projectId: string, milestoneId?: string, issueId?: string, limits?: ContextLimits): ExecutionContext {
        const project = this.projectRepo.get(projectId);
        if (!project) throw new Error("Project not found");

        let milestone = undefined;
        let verificationHistory: any[] = [];
        if (milestoneId) {
            milestone = this.milestoneRepo.get(milestoneId);
            verificationHistory = this.verificationRepo.listByMilestone(milestoneId) || [];
            if (limits?.maxVerificationRuns) {
                verificationHistory = verificationHistory.slice(-limits.maxVerificationRuns);
            }
        }

        let currentIssue = undefined;
        const dependencies: Issue[] = [];
        let previousAttempts: any[] = [];
        let recentCodeReviews: any[] = [];
        let recentArtifactChanges: any[] = [];
        let recentTestResults: any[] = [];
        let relatedFixIssues: Issue[] = [];

        if (issueId) {
            currentIssue = this.issueRepo.get(issueId);
            if (currentIssue) {
                const depIds = this.issueRepo.getDependencies(issueId);
                for (const depId of depIds) {
                    const dep = this.issueRepo.get(depId);
                    if (dep) dependencies.push(dep);
                }

                // If this is a FIX issue, find its source issue
                const sourceIssueId = currentIssue.type === "FIX" ? currentIssue.sourceVerificationId || currentIssue.title.split("for ")[1] : issueId;
                
                // We use sourceIssueId if it's a FIX, but actually let's just get runs for this specific issue. 
                // Wait, if it's a FIX issue, we WANT to see the previous attempts of the original issue that caused it to be created.
                // Or maybe we just want the AgentRuns for the specific issue, AND the FIX issue?
                let relevantIssueIds = [issueId];
                if (currentIssue.type === "FIX" && currentIssue.title.includes("for ")) {
                    // Extremely naive extraction for demo purposes
                    const match = currentIssue.title.match(/ISSUE-\d+/);
                    if (match && milestoneId) {
                        const original = this.issueRepo.listByMilestone(milestoneId).find(i => i.title.includes(match[0]) && i.type !== "FIX");
                        if (original) relevantIssueIds.push(original.id);
                    }
                } else if (currentIssue.type !== "FIX" && milestoneId) {
                    // find any FIX issues that were for this
                    const allIssues = this.issueRepo.listByMilestone(milestoneId);
                    const fixes = allIssues.filter(i => i.type === "FIX" && i.title.includes(currentIssue!.title));
                    relevantIssueIds.push(...fixes.map(f => f.id));
                    relatedFixIssues = fixes;
                }

                // Gather from all relevant issues
                for (const iId of relevantIssueIds) {
                    previousAttempts.push(...(this.runRepo.getByIssueId(iId) || []));
                    recentCodeReviews.push(...(this.reviewRepo.listByIssue(iId) || []));
                    recentArtifactChanges.push(...(this.artifactRepo.listByIssue(iId) || []));
                    recentTestResults.push(...(this.testRepo.listByIssue(iId) || []));
                }

                // Sort by time (since we grabbed from multiple issues)
                previousAttempts.sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime());
                // For simplicity, we just slice the end
                if (limits?.maxAgentRuns) previousAttempts = previousAttempts.slice(-limits.maxAgentRuns);
                if (limits?.maxReviews) recentCodeReviews = recentCodeReviews.slice(-limits.maxReviews);
                if (limits?.maxArtifactChanges) recentArtifactChanges = recentArtifactChanges.slice(-limits.maxArtifactChanges);
                if (limits?.maxTestResults) recentTestResults = recentTestResults.slice(-limits.maxTestResults);
            }
        }

        return {
            project,
            milestone,
            currentIssue,
            dependencies,
            previousAttempts,
            recentArtifactChanges,
            recentCodeReviews,
            recentTestResults,
            verificationHistory,
            relatedFixIssues
        };
    }
}
