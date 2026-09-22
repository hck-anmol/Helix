export type Phase = "IDLE" | "STRATEGY" | "EXECUTION" | "VERIFICATION" | "COMPLETED" | "FAILED";

export class StateMachine {
    private currentPhase: Phase = "IDLE";

    constructor(initialPhase: Phase = "IDLE") {
        this.currentPhase = initialPhase;
    }

    get phase() {
        return this.currentPhase;
    }

    transition(nextPhase: Phase) {
        const allowed: Record<Phase, Phase[]> = {
            IDLE: ["STRATEGY"],
            STRATEGY: ["EXECUTION", "FAILED"],
            EXECUTION: ["VERIFICATION", "FAILED"],
            VERIFICATION: ["STRATEGY", "COMPLETED", "EXECUTION", "FAILED"], // Execution for retry
            COMPLETED: [],
            FAILED: ["STRATEGY", "EXECUTION"] // allow manual restart
        };

        if (!allowed[this.currentPhase].includes(nextPhase)) {
            throw new Error(`Invalid transition from ${this.currentPhase} to ${nextPhase}`);
        }

        this.currentPhase = nextPhase;
    }
}
