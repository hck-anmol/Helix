import { db } from "../database";
import { CodeReview } from "../../projects/CodeReview";

export class CodeReviewRepository {
    create(review: CodeReview) {
        const stmt = db.prepare(`
            INSERT INTO code_reviews (id, projectId, milestoneId, issueId, agentRunId, status, summary, findings, filesReviewed)
            VALUES (@id, @projectId, @milestoneId, @issueId, @agentRunId, @status, @summary, @findings, @filesReviewed)
        `);
        stmt.run({
            ...review,
            findings: JSON.stringify(review.findings),
            filesReviewed: JSON.stringify(review.filesReviewed)
        });
    }

    listByMilestone(milestoneId: string): CodeReview[] {
        const stmt = db.prepare(`SELECT * FROM code_reviews WHERE milestoneId = ?`);
        const rows = stmt.all(milestoneId) as any[];
        return rows.map(r => ({
            ...r,
            findings: JSON.parse(r.findings),
            filesReviewed: JSON.parse(r.filesReviewed)
        }));
    }

    listByIssue(issueId: string): CodeReview[] {
        const stmt = db.prepare(`SELECT * FROM code_reviews WHERE issueId = ?`);
        const rows = stmt.all(issueId) as any[];
        return rows.map(r => ({
            ...r,
            findings: JSON.parse(r.findings),
            filesReviewed: JSON.parse(r.filesReviewed)
        }));
    }
}
