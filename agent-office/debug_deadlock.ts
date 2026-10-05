import { IssueRepository } from "./src/persistence/repositories/IssueRepository";
import { db } from "./src/persistence/database";
const issueRepo = new IssueRepository();

// Get the latest milestone
const milestones = db.prepare("SELECT id FROM milestones ORDER BY rowid DESC LIMIT 1").all();
if (milestones.length > 0) {
    const mId = milestones[0].id;
    console.log("Issues before:");
    console.log(issueRepo.listByMilestone(mId));
    issueRepo.evaluateIssueStates(mId);
    console.log("Issues after:");
    console.log(issueRepo.listByMilestone(mId));
}
