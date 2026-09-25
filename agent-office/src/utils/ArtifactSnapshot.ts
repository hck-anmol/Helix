import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface SnapshotFile {
    hash: string;
    size: number;
}

export type Snapshot = Map<string, SnapshotFile>;

export interface ArtifactChangeData {
    path: string;
    changeType: "CREATED" | "MODIFIED" | "DELETED" | "UNCHANGED";
    beforeHash: string | null;
    afterHash: string | null;
    beforeSize: number | null;
    afterSize: number | null;
}

export class ArtifactSnapshot {
    private static IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build"]);

    static takeSnapshot(dirPath: string): Snapshot {
        const snapshot: Snapshot = new Map();
        if (!fs.existsSync(dirPath)) return snapshot;

        const walk = (currentPath: string) => {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                if (this.IGNORED_DIRS.has(entry.name)) continue;

                const fullPath = path.join(currentPath, entry.name);
                const relPath = path.relative(dirPath, fullPath);

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile()) {
                    try {
                        const content = fs.readFileSync(fullPath);
                        const hash = crypto.createHash("sha256").update(content).digest("hex");
                        snapshot.set(relPath, {
                            hash,
                            size: content.length
                        });
                    } catch (e) {
                        // ignore unreadable files
                    }
                }
            }
        };

        walk(dirPath);
        return snapshot;
    }

    static compare(before: Snapshot, after: Snapshot): ArtifactChangeData[] {
        const changes: ArtifactChangeData[] = [];
        const allPaths = new Set([...before.keys(), ...after.keys()]);

        for (const p of allPaths) {
            const b = before.get(p);
            const a = after.get(p);

            if (b && !a) {
                changes.push({
                    path: p,
                    changeType: "DELETED",
                    beforeHash: b.hash,
                    afterHash: null,
                    beforeSize: b.size,
                    afterSize: null
                });
            } else if (!b && a) {
                changes.push({
                    path: p,
                    changeType: "CREATED",
                    beforeHash: null,
                    afterHash: a.hash,
                    beforeSize: null,
                    afterSize: a.size
                });
            } else if (b && a) {
                if (b.hash !== a.hash) {
                    changes.push({
                        path: p,
                        changeType: "MODIFIED",
                        beforeHash: b.hash,
                        afterHash: a.hash,
                        beforeSize: b.size,
                        afterSize: a.size
                    });
                }
                // We do not record UNCHANGED files in the diff list to save space
            }
        }

        return changes;
    }

    static serialize(snapshot: Snapshot): Record<string, SnapshotFile> {
        const obj: Record<string, SnapshotFile> = {};
        for (const [key, val] of snapshot.entries()) {
            obj[key] = val;
        }
        return obj;
    }

    static deserialize(obj: Record<string, SnapshotFile>): Snapshot {
        const map = new Map<string, SnapshotFile>();
        for (const key of Object.keys(obj)) {
            map.set(key, obj[key]);
        }
        return map;
    }
}
