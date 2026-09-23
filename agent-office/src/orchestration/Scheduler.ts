import { IssueRepository } from "../persistence/repositories/IssueRepository";
import { Issue } from "../projects/Issue";

const PRIORITY_WEIGHTS: Record<string, number> = {
    "CRITICAL": 4,
    "HIGH": 3,
    "MEDIUM": 2,
    "LOW": 1
};

export class Scheduler {
    constructor(private issueRepo: IssueRepository) {}

    getReadyIssues(milestoneId: string): Issue[] {
        // First, ensure all issue states reflect their dependencies
        this.issueRepo.evaluateIssueStates(milestoneId);
        
        const openIssues = this.issueRepo.listOpenByMilestone(milestoneId);
        
        // Filter out those that are strictly READY
        const readyIssues = openIssues.filter(i => i.status === "READY");
        
        // Sort by priority
        readyIssues.sort((a, b) => {
            const weightA = PRIORITY_WEIGHTS[a.priority as string] || 0;
            const weightB = PRIORITY_WEIGHTS[b.priority as string] || 0;
            return weightB - weightA;
        });
        
        return readyIssues;
    }
}
