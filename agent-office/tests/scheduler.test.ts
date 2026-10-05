import { IssueRepository } from "../src/persistence/repositories/IssueRepository";
import { ProjectRepository } from "../src/persistence/repositories/ProjectRepository";
import { MilestoneRepository } from "../src/persistence/repositories/MilestoneRepository";
import { Scheduler } from "../src/orchestration/Scheduler";
import { IssuePriority } from "../src/projects/Issue";
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

    function createIssue(id: string, priority: IssuePriority) {
        issueRepo.create({
            id,
            projectId,
            milestoneId,
            title: id,
            description: id,
            type: "TASK",
            priority,
            status: "PENDING",
            fixAttempts: 0,
            attemptCount: 0
        });
    }

    const LOW = "LOW_ISSUE-" + projectId;
    const HIGH = "HIGH_ISSUE-" + projectId;
    const CRITICAL = "CRITICAL_ISSUE-" + projectId;

    createIssue(LOW, "LOW");
    createIssue(HIGH, "HIGH");
    createIssue(CRITICAL, "CRITICAL");

    // All are PENDING, no dependencies.
    const ready1 = scheduler.getReadyIssues(milestoneId);
    if (ready1.length !== 3) throw new Error("Expected 3 ready issues");
    if (ready1[0].id !== CRITICAL) throw new Error("CRITICAL should be first");
    if (ready1[1].id !== HIGH) throw new Error("HIGH should be second");
    if (ready1[2].id !== LOW) throw new Error("LOW should be third");
    
    console.log("Priority scheduling passed");

    // Add a dependency: CRITICAL depends on LOW
    issueRepo.addDependency(CRITICAL, LOW);
    
    const ready2 = scheduler.getReadyIssues(milestoneId);
    if (ready2.length !== 2) throw new Error("Expected 2 ready issues (CRITICAL should be blocked)");
    if (ready2[0].id !== HIGH) throw new Error("HIGH should be first");
    if (ready2[1].id !== LOW) throw new Error("LOW should be second");

    const critical = issueRepo.get(CRITICAL);
    if (critical?.status !== "BLOCKED") throw new Error("CRITICAL_ISSUE should be BLOCKED");

    console.log("Dependency overrides priority passed");

    // Regression test for Executor termination
    const { ParallelExecutor } = require("../src/orchestration/ParallelExecutor");
    
    // Create mocks for executor
    const contractRepo = new (require("../src/persistence/repositories/AgentContractRepository").AgentContractRepository)();
    const runRepo = new (require("../src/persistence/repositories/AgentRunRepository").AgentRunRepository)();
    const artifactChangeRepo = new (require("../src/persistence/repositories/ArtifactChangeRepository").ArtifactChangeRepository)();
    const testResultRepo = new (require("../src/persistence/repositories/TestResultRepository").TestResultRepository)();
    const codeReviewRepo = new (require("../src/persistence/repositories/CodeReviewRepository").CodeReviewRepository)();
    const verificationRepo = new (require("../src/persistence/repositories/VerificationRepository").VerificationRepository)();
    
    const executor = new ParallelExecutor(
        projectRepo, issueRepo, contractRepo, runRepo, artifactChangeRepo,
        testResultRepo, codeReviewRepo, milestoneRepo, verificationRepo,
        {} as any, {} as any, {} as any
    );

    // Mock executeIssue
    (executor as any).executeIssue = async function(issue: any, globalContext: any) {
        // Just resolve the issue directly for the happy path
        issueRepo.updateStatus(issue.id, "RESOLVED");
    };

    const ms2Id = crypto.randomUUID();
    milestoneRepo.create({
        id: ms2Id, projectId, title: "MS2", description: "", status: "PLANNED", budget: 1, verificationAttempts: 0
    });

    const I1 = "I1-" + projectId;
    const I2 = "I2-" + projectId;
    const I3 = "I3-" + projectId;
    const I4 = "I4-" + projectId;
    
    function createI(id: string) {
        issueRepo.create({ id, projectId, milestoneId: ms2Id, title: id, description: id, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });
    }
    createI(I1); createI(I2); createI(I3); createI(I4);
    
    issueRepo.addDependency(I2, I1);
    issueRepo.addDependency(I3, I2);
    issueRepo.addDependency(I4, I3);
    
    await executor.executeMilestone({ projectId, currentMilestoneId: ms2Id } as any);
    
    const issuesAfter = issueRepo.listByMilestone(ms2Id);
    if (issuesAfter.some(i => i.status !== "RESOLVED")) {
        throw new Error("4-issue chain did not complete");
    }
    console.log("4-issue dependency chain termination passed");

    // Deadlock test
    const ms3Id = crypto.randomUUID();
    milestoneRepo.create({
        id: ms3Id, projectId, title: "MS3", description: "", status: "PLANNED", budget: 1, verificationAttempts: 0
    });

    const FAILED_ISSUE = "FAIL-" + projectId;
    issueRepo.create({ id: FAILED_ISSUE, projectId, milestoneId: ms3Id, title: FAILED_ISSUE, description: FAILED_ISSUE, type: "TASK", priority: "MEDIUM", status: "FAILED", fixAttempts: 0, attemptCount: 0 });
    const DEP_ISSUE = "DEP-" + projectId;
    issueRepo.create({ id: DEP_ISSUE, projectId, milestoneId: ms3Id, title: DEP_ISSUE, description: DEP_ISSUE, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });
    issueRepo.addDependency(DEP_ISSUE, FAILED_ISSUE);

    let loopTerminated = false;
    const timeout = setTimeout(() => {
        if (!loopTerminated) {
            console.error("Executor is looping infinitely!");
            process.exit(1);
        }
    }, 2000);

    await executor.executeMilestone({ projectId, currentMilestoneId: ms3Id } as any);
    loopTerminated = true;
    clearTimeout(timeout);
    
    const failedIssueAfter = issueRepo.get(FAILED_ISSUE);
    if (failedIssueAfter?.status !== "FAILED") throw new Error("Failed issue should remain FAILED");
    const depIssueAfter = issueRepo.get(DEP_ISSUE);
    if (depIssueAfter?.status !== "BLOCKED") throw new Error("Dependent issue should remain BLOCKED");

    console.log("Deadlock termination passed");

    // Parallel Execution Test
    const ms4Id = crypto.randomUUID();
    milestoneRepo.create({
        id: ms4Id, projectId, title: "MS4", description: "", status: "PLANNED", budget: 1, verificationAttempts: 0
    });

    const P1 = "P1-" + projectId;
    const P2 = "P2-" + projectId;
    const P3 = "P3-" + projectId;
    issueRepo.create({ id: P1, projectId, milestoneId: ms4Id, title: P1, description: P1, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0, assignedRole: "researcher" });
    issueRepo.create({ id: P2, projectId, milestoneId: ms4Id, title: P2, description: P2, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0, assignedRole: "researcher" });
    issueRepo.create({ id: P3, projectId, milestoneId: ms4Id, title: P3, description: P3, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0, assignedRole: "researcher" });
    
    let activeTasks = 0;
    let maxActiveTasks = 0;
    
    (executor as any).executeIssue = async function(issue: any, globalContext: any) {
        activeTasks++;
        if (activeTasks > maxActiveTasks) maxActiveTasks = activeTasks;
        
        await new Promise(resolve => setTimeout(resolve, 50)); 
        
        activeTasks--;
        issueRepo.updateStatus(issue.id, "RESOLVED");
    };

    (executor as any).maxConcurrency = 2; 

    await executor.executeMilestone({ projectId, currentMilestoneId: ms4Id } as any);

    if (maxActiveTasks !== 2) {
        throw new Error(`Expected max active tasks to be 2 for parallel execution, got ${maxActiveTasks}`);
    }
    console.log("Parallel execution test passed");

    // Sequential Execution Test (Developer tasks should be serialized)
    const ms5Id = crypto.randomUUID();
    milestoneRepo.create({
        id: ms5Id, projectId, title: "MS5", description: "", status: "PLANNED", budget: 1, verificationAttempts: 0
    });

    const S1 = "S1-" + projectId;
    const S2 = "S2-" + projectId;
    issueRepo.create({ id: S1, projectId, milestoneId: ms5Id, title: S1, description: S1, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0, assignedRole: "developer" });
    issueRepo.create({ id: S2, projectId, milestoneId: ms5Id, title: S2, description: S2, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0, assignedRole: "developer" });

    activeTasks = 0;
    maxActiveTasks = 0;

    await executor.executeMilestone({ projectId, currentMilestoneId: ms5Id } as any);

    if (maxActiveTasks !== 1) {
        throw new Error(`Expected max active tasks to be 1 for serialized developer tasks, got ${maxActiveTasks}`);
    }
    console.log("Sequential execution (developer constraint) test passed");

    // Sequence cascade test (001 -> 002 -> 003 -> 004)
    const msCascadeId = crypto.randomUUID();
    milestoneRepo.create({
        id: msCascadeId, projectId, title: "MS Cascade", description: "", status: "PLANNED", budget: 1, verificationAttempts: 0
    });
    const T1 = "001-" + projectId;
    const T2 = "002-" + projectId;
    const T3 = "003-" + projectId;
    const T4 = "004-" + projectId;

    issueRepo.create({ id: T1, projectId, milestoneId: msCascadeId, title: T1, description: T1, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });
    issueRepo.create({ id: T2, projectId, milestoneId: msCascadeId, title: T2, description: T2, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });
    issueRepo.create({ id: T3, projectId, milestoneId: msCascadeId, title: T3, description: T3, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });
    issueRepo.create({ id: T4, projectId, milestoneId: msCascadeId, title: T4, description: T4, type: "TASK", priority: "MEDIUM", status: "PENDING", fixAttempts: 0, attemptCount: 0 });

    issueRepo.addDependency(T2, T1);
    issueRepo.addDependency(T3, T2);
    issueRepo.addDependency(T4, T3);

    issueRepo.evaluateIssueStates(msCascadeId);
    if (issueRepo.get(T1)?.status !== "READY") throw new Error("001 should be READY");
    if (issueRepo.get(T2)?.status !== "BLOCKED") throw new Error("002 should be BLOCKED");
    if (issueRepo.get(T3)?.status !== "BLOCKED") throw new Error("003 should be BLOCKED");
    if (issueRepo.get(T4)?.status !== "BLOCKED") throw new Error("004 should be BLOCKED");

    issueRepo.updateStatus(T1, "RESOLVED");
    issueRepo.evaluateIssueStates(msCascadeId);
    if (issueRepo.get(T2)?.status !== "READY") throw new Error("002 should be READY after 001");
    if (issueRepo.get(T3)?.status !== "BLOCKED") throw new Error("003 should be BLOCKED");

    issueRepo.updateStatus(T2, "RESOLVED");
    issueRepo.evaluateIssueStates(msCascadeId);
    if (issueRepo.get(T3)?.status !== "READY") throw new Error("003 should be READY after 002");

    issueRepo.updateStatus(T3, "RESOLVED");
    issueRepo.evaluateIssueStates(msCascadeId);
    if (issueRepo.get(T4)?.status !== "READY") throw new Error("004 should be READY after 003");

    issueRepo.updateStatus(T4, "RESOLVED");
    issueRepo.evaluateIssueStates(msCascadeId);
    if (issueRepo.listByMilestone(msCascadeId).some(i => i.status !== "RESOLVED")) throw new Error("All should be RESOLVED");

    console.log("Dependency cascade state evaluation test passed");
}
