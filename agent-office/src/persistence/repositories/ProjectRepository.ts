import { db } from "../database";

export interface ProjectRecord {
    id: string;
    name: string;
    specification: string;
    successCriteria: string;
    currentPhase: string;
    createdAt?: string;
    updatedAt?: string;
}

export class ProjectRepository {
    create(project: ProjectRecord) {
        const stmt = db.prepare(`
            INSERT INTO projects (id, name, specification, successCriteria, currentPhase)
            VALUES (@id, @name, @specification, @successCriteria, @currentPhase)
        `);
        stmt.run(project);
    }

    updatePhase(id: string, phase: string) {
        const stmt = db.prepare(`UPDATE projects SET currentPhase = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`);
        stmt.run(phase, id);
    }

    get(id: string): ProjectRecord | undefined {
        const stmt = db.prepare(`SELECT * FROM projects WHERE id = ?`);
        return stmt.get(id) as ProjectRecord | undefined;
    }
}
