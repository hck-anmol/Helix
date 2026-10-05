import { ProjectRecord } from "../persistence/repositories/ProjectRepository";
import { MilestoneRecord } from "../persistence/repositories/MilestoneRepository";
import { Issue } from "../projects/Issue";
import { AgentRunRecord } from "../persistence/repositories/AgentRunRepository";
import { ArtifactChangeData } from "../utils/ArtifactSnapshot";
import { CodeReview } from "../projects/CodeReview";
import { TestResult } from "../projects/TestResult";
import { VerificationRun } from "../persistence/repositories/VerificationRepository";

export interface ExecutionContext {
    project: ProjectRecord;
    milestone?: MilestoneRecord;
    currentIssue?: Issue;
    
    dependencies: Issue[];
    previousAttempts: AgentRunRecord[];
    recentArtifactChanges: ArtifactChangeData[];
    recentCodeReviews: CodeReview[];
    recentTestResults: TestResult[];
    verificationHistory: VerificationRun[];
    relatedFixIssues: Issue[];
}
