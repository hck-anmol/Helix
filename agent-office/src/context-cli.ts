import { ProjectRepository } from "./persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "./persistence/repositories/MilestoneRepository";
import { IssueRepository } from "./persistence/repositories/IssueRepository";
import { AgentRunRepository } from "./persistence/repositories/AgentRunRepository";
import { CodeReviewRepository } from "./persistence/repositories/CodeReviewRepository";
import { ArtifactChangeRepository } from "./persistence/repositories/ArtifactChangeRepository";
import { TestResultRepository } from "./persistence/repositories/TestResultRepository";
import { VerificationRepository } from "./persistence/repositories/VerificationRepository";
import { ContextBuilder } from "./context/ContextBuilder";
import { ContextSerializer } from "./context/ContextSerializer";

async function main() {
    const issueId = process.argv[2];
    if (!issueId) {
        console.error("Usage: npm run context <issueId>");
        process.exit(1);
    }

    const issueRepo = new IssueRepository();
    const issue = issueRepo.get(issueId);
    
    if (!issue) {
        console.error("Issue not found");
        process.exit(1);
    }

    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const runRepo = new AgentRunRepository();
    const reviewRepo = new CodeReviewRepository();
    const artifactRepo = new ArtifactChangeRepository();
    const testRepo = new TestResultRepository();
    const verificationRepo = new VerificationRepository();

    const builder = new ContextBuilder(
        projectRepo, milestoneRepo, issueRepo, runRepo, reviewRepo, artifactRepo, testRepo, verificationRepo
    );

    const context = builder.build(issue.projectId, issue.milestoneId, issueId, {
        maxAgentRuns: 5,
        maxReviews: 3,
        maxArtifactChanges: 10,
        maxTestResults: 10
    });

    const serialized = ContextSerializer.serialize(context);
    console.log(serialized);
}

main().catch(console.error);
