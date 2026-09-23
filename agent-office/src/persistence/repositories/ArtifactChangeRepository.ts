import { db } from "../database";
import { ArtifactChange } from "../../projects/ArtifactChange";

export class ArtifactChangeRepository {
    create(change: ArtifactChange) {
        const stmt = db.prepare(`
            INSERT INTO artifact_changes (id, projectId, milestoneId, issueId, agentRunId, path, changeType, beforeHash, afterHash, beforeSize, afterSize)
            VALUES (@id, @projectId, @milestoneId, @issueId, @agentRunId, @path, @changeType, @beforeHash, @afterHash, @beforeSize, @afterSize)
        `);
        stmt.run(change);
    }

    listByAgentRun(agentRunId: string): ArtifactChange[] {
        const stmt = db.prepare(`SELECT * FROM artifact_changes WHERE agentRunId = ?`);
        return stmt.all(agentRunId) as ArtifactChange[];
    }

    listByMilestone(milestoneId: string): ArtifactChange[] {
        const stmt = db.prepare(`SELECT * FROM artifact_changes WHERE milestoneId = ?`);
        return stmt.all(milestoneId) as ArtifactChange[];
    }
}
