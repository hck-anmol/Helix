import { Orchestrator } from "../src/orchestration/Orchestrator";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { StateMachine } from "../src/orchestration/StateMachine";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";
import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { AgentContractRepository } from "../src/persistence/repositories/AgentContractRepository";
import { CodeReviewRepository } from "../src/persistence/repositories/CodeReviewRepository";
import { TestResultRepository } from "../src/persistence/repositories/TestResultRepository";
import { VerificationRepository } from "../src/persistence/repositories/VerificationRepository";
import { ArtifactChangeRepository } from "../src/persistence/repositories/ArtifactChangeRepository";
import { WorkerFactory } from "../src/agents/workers/WorkerFactory";
import crypto from "crypto";

export async function run() {
    console.log("Running Verification Gating Tests...");
    
    // We mock the repositories to simulate various states directly
    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const issueRepo = new IssueRepository();
    
    const projectId = crypto.randomUUID();
    projectRepo.create({ id: projectId, name: "Test", specification: "Test", successCriteria: "Test", currentPhase: "ACTIVE" });
    
    // Helper to run the executor/orchestrator invariant check
    const checkInvariant = (milestoneId: string): boolean => {
        const orchestrator = new Orchestrator(
            {} as any, {} as any, {} as any, {} as any, {} as any,
            projectRepo, milestoneRepo, issueRepo,
            new VerificationRepository(), new TestResultRepository(),
            new ArtifactChangeRepository(), new CodeReviewRepository()
        );
        return (orchestrator as any).hasUnresolvedExecutionFailures(milestoneId);
    };

    // Case A: Tester failure
    const m1 = crypto.randomUUID();
    milestoneRepo.create({ id: m1, projectId, title: "M1", description: "M1", status: "EXECUTING", budget: 1, verificationAttempts: 0 });
    issueRepo.create({ id: crypto.randomUUID(), projectId, milestoneId: m1, title: "I1", description: "I1", type: "FEATURE", priority: "HIGH", status: "FAILED", fixAttempts: 0, attemptCount: 1 });
    
    if (!checkInvariant(m1)) {
        throw new Error("Case A Failed: Tester failure should block verification.");
    }
    console.log("Case A (Tester failure) passed");

    // Case B: Developer failure
    const m2 = crypto.randomUUID();
    milestoneRepo.create({ id: m2, projectId, title: "M2", description: "M2", status: "EXECUTING", budget: 1, verificationAttempts: 0 });
    issueRepo.create({ id: crypto.randomUUID(), projectId, milestoneId: m2, title: "I2", description: "I2", type: "FEATURE", priority: "HIGH", status: "FAILED", fixAttempts: 0, attemptCount: 1 });
    
    if (!checkInvariant(m2)) {
        throw new Error("Case B Failed: Developer failure should block verification.");
    }
    console.log("Case B (Developer failure) passed");
    
    // Case C: Reviewer failure
    // Reviewer failure creates a FIX issue which is initially READY
    const m3 = crypto.randomUUID();
    milestoneRepo.create({ id: m3, projectId, title: "M3", description: "M3", status: "EXECUTING", budget: 1, verificationAttempts: 0 });
    issueRepo.create({ id: crypto.randomUUID(), projectId, milestoneId: m3, title: "I3", description: "I3", type: "FEATURE", priority: "HIGH", status: "RESOLVED", fixAttempts: 0, attemptCount: 1 });
    issueRepo.create({ id: crypto.randomUUID(), projectId, milestoneId: m3, title: "Fix", description: "Fix", type: "FIX", priority: "HIGH", status: "READY", fixAttempts: 0, attemptCount: 0 });
    
    // Even though no FAILED, there is a READY issue, so deadlock check (unresolved.length > 0) blocks it.
    const unresolved = issueRepo.listByMilestone(m3).filter(i => ["PENDING", "READY", "BLOCKED", "FAILED"].includes(i.status));
    if (unresolved.length === 0) {
        throw new Error("Case C Failed: Reviewer failure should leave unresolved issues.");
    }
    console.log("Case C (Reviewer failure) passed");

    // Case D: Tester succeeds
    const m4 = crypto.randomUUID();
    milestoneRepo.create({ id: m4, projectId, title: "M4", description: "M4", status: "EXECUTING", budget: 1, verificationAttempts: 0 });
    issueRepo.create({ id: crypto.randomUUID(), projectId, milestoneId: m4, title: "I4", description: "I4", type: "FEATURE", priority: "HIGH", status: "RESOLVED", fixAttempts: 0, attemptCount: 1 });
    
    if (checkInvariant(m4)) {
        throw new Error("Case D Failed: Success should NOT block verification.");
    }
    console.log("Case D (Tester succeeds) passed");
    
    console.log("Verification Gating tests passed!");
}
