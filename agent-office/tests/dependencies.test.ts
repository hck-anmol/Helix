import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";
import crypto from "crypto";

export async function run() {
    const issueRepo = new IssueRepository();
    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();

    const projectId = "test-project-" + crypto.randomUUID();
    const milestoneId = "test-milestone-" + crypto.randomUUID();

    projectRepo.create({
        id: projectId,
        name: "Test Project",
        specification: "Spec",
        successCriteria: "Crit",
        currentPhase: "IDLE"
    });

    milestoneRepo.create({
        id: milestoneId,
        projectId,
        title: "Test Milestone",
        description: "Desc",
        status: "PLANNED",
        budget: 1,
        verificationAttempts: 0
    });

    function createIssue(id: string) {
        issueRepo.create({
            id,
            projectId,
            milestoneId,
            title: id,
            description: id,
            type: "TASK",
            priority: "MEDIUM",
            status: "PENDING",
            fixAttempts: 0,
            attemptCount: 0
        });
    }

    const A = "A-" + projectId;
    const B = "B-" + projectId;
    const C = "C-" + projectId;

    createIssue(A);
    createIssue(B);
    createIssue(C);

    // A -> B -> C is valid
    issueRepo.addDependency(B, A); // B depends on A
    issueRepo.addDependency(C, B); // C depends on B

    const depsB = issueRepo.getDependencies(B);
    if (!depsB.includes(A)) throw new Error("Dependency A not found for B");

    // Cycle detection: A -> C should fail because C depends on B which depends on A
    let caught = false;
    try {
        issueRepo.addDependency(A, C); // A depends on C
    } catch (e) {
        caught = true;
    }

    if (!caught) {
        throw new Error("Cycle detection failed for A -> C");
    }

    console.log("Cycle detection passed");

    // State evaluation test
    issueRepo.evaluateIssueStates(milestoneId);
    
    let a = issueRepo.get(A);
    let b = issueRepo.get(B);
    let c = issueRepo.get(C);
    
    if (a?.status !== "READY") throw new Error("A should be READY");
    if (b?.status !== "BLOCKED") throw new Error("B should be BLOCKED");
    if (c?.status !== "BLOCKED") throw new Error("C should be BLOCKED");

    console.log("State evaluation (initial) passed");

    issueRepo.updateStatus(A, "RESOLVED");
    issueRepo.evaluateIssueStates(milestoneId);

    a = issueRepo.get(A);
    b = issueRepo.get(B);
    c = issueRepo.get(C);

    if (a?.status !== "RESOLVED") throw new Error("A should be RESOLVED");
    if (b?.status !== "READY") throw new Error("B should be READY");
    if (c?.status !== "BLOCKED") throw new Error("C should be BLOCKED");

    console.log("State evaluation (after A resolved) passed");
}
