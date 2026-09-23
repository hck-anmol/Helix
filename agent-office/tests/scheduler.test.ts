import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";
import { Scheduler } from "../src/orchestration/Scheduler";
import crypto from "crypto";

export async function run() {
    const issueRepo = new IssueRepository();
    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const scheduler = new Scheduler(issueRepo);

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

    function createIssue(id: string, priority: string) {
        issueRepo.create({
            id,
            projectId,
            milestoneId,
            title: id,
            description: id,
            type: "TASK",
            priority,
            status: "PENDING",
            fixAttempts: 0
        });
    }

    createIssue("LOW_ISSUE", "LOW");
    createIssue("HIGH_ISSUE", "HIGH");
    createIssue("CRITICAL_ISSUE", "CRITICAL");

    // All are PENDING, no dependencies.
    const ready1 = scheduler.getReadyIssues(milestoneId);
    if (ready1.length !== 3) throw new Error("Expected 3 ready issues");
    if (ready1[0].id !== "CRITICAL_ISSUE") throw new Error("CRITICAL should be first");
    if (ready1[1].id !== "HIGH_ISSUE") throw new Error("HIGH should be second");
    if (ready1[2].id !== "LOW_ISSUE") throw new Error("LOW should be third");
    
    console.log("Priority scheduling passed");

    // Add a dependency: CRITICAL depends on LOW
    issueRepo.addDependency("CRITICAL_ISSUE", "LOW_ISSUE");
    
    const ready2 = scheduler.getReadyIssues(milestoneId);
    if (ready2.length !== 2) throw new Error("Expected 2 ready issues (CRITICAL should be blocked)");
    if (ready2[0].id !== "HIGH_ISSUE") throw new Error("HIGH should be first");
    if (ready2[1].id !== "LOW_ISSUE") throw new Error("LOW should be second");

    const critical = issueRepo.get("CRITICAL_ISSUE");
    if (critical?.status !== "BLOCKED") throw new Error("CRITICAL_ISSUE should be BLOCKED");

    console.log("Dependency overrides priority passed");
}
