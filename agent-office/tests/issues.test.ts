import assert from "assert";
import crypto from "crypto";
import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";

function runTests() {
    console.log("Running IssueRepository Tests...");

    const projectRepo = new ProjectRepository();
    const milestoneRepo = new MilestoneRepository();
    const issueRepo = new IssueRepository();

    const projectId = crypto.randomUUID();
    const milestoneId = crypto.randomUUID();
    const issueId = crypto.randomUUID();

    projectRepo.create({
        id: projectId,
        name: "Test Project",
        specification: "Spec",
        successCriteria: "Criteria",
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

    issueRepo.create({
        id: issueId,
        projectId,
        milestoneId,
        title: "Test Issue",
        description: "Test Desc",
        type: "BUG",
        priority: "HIGH",
        status: "PENDING",
        fixAttempts: 0,
        attemptCount: 0
    });

    let issue = issueRepo.get(issueId);
    assert.ok(issue);
    assert.strictEqual(issue.title, "Test Issue");
    assert.strictEqual(issue.status, "PENDING");
    assert.strictEqual(issue.fixAttempts, 0);

    issueRepo.updateStatus(issueId, "RUNNING");
    issue = issueRepo.get(issueId);
    assert.strictEqual(issue!.status, "RUNNING");

    issueRepo.incrementFixAttempts(issueId);
    issue = issueRepo.get(issueId);
    assert.strictEqual(issue!.fixAttempts, 1);

    const openIssues = issueRepo.listOpenByMilestone(milestoneId);
    assert.strictEqual(openIssues.length, 1);
    assert.strictEqual(openIssues[0].id, issueId);

    issueRepo.updateStatus(issueId, "VERIFIED");
    const openIssuesAfter = issueRepo.listOpenByMilestone(milestoneId);
    assert.strictEqual(openIssuesAfter.length, 0);

    console.log("IssueRepository tests passed!");
}

runTests();
