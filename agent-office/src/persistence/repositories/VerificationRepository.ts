import { db } from "../database";

export interface VerificationRun {
    id: string;
    milestoneId: string;
    attemptNumber: number;
    status: string;
    evidence: string;
    failures: string;
    requiredFixes: string;
    createdAt?: string;
}

export class VerificationRepository {
    create(run: VerificationRun) {
        const stmt = db.prepare(`
            INSERT INTO verification_runs (id, milestoneId, attemptNumber, status, evidence, failures, requiredFixes)
            VALUES (@id, @milestoneId, @attemptNumber, @status, @evidence, @failures, @requiredFixes)
        `);
        stmt.run(run);
    }

    listByMilestone(milestoneId: string): VerificationRun[] {
        const stmt = db.prepare(`SELECT * FROM verification_runs WHERE milestoneId = ? ORDER BY attemptNumber ASC`);
        return stmt.all(milestoneId) as VerificationRun[];
    }
}
