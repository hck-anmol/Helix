import { MilestoneStatus } from "../projects/Milestone";

export class StateMachine {
    private currentPhase: MilestoneStatus = "PLANNED";

    constructor(initialPhase: MilestoneStatus = "PLANNED") {
        this.currentPhase = initialPhase;
    }

    get phase() {
        return this.currentPhase;
    }

    transition(nextPhase: MilestoneStatus) {
        const allowed: Record<MilestoneStatus, MilestoneStatus[]> = {
            PLANNED: ["ACTIVE"],
            ACTIVE: ["EXECUTING"],
            EXECUTING: ["VERIFYING"],
            VERIFYING: ["COMPLETED", "FAILED"],
            FAILED: ["EXECUTING"],
            COMPLETED: [],
            BLOCKED: ["EXECUTING", "PLANNED"]
        };

        if (!allowed[this.currentPhase].includes(nextPhase)) {
            throw new Error(`Invalid transition from ${this.currentPhase} to ${nextPhase}`);
        }

        this.currentPhase = nextPhase;
    }
}
