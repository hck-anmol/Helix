import assert from "assert";
import { StateMachine } from "../src/orchestration/StateMachine";
import { MilestoneStatus } from "../src/projects/Milestone";

function runTests() {
    console.log("Running StateMachine Tests...");

    const sm = new StateMachine("PLANNED");
    assert.strictEqual(sm.phase, "PLANNED");

    // Valid transitions
    sm.transition("ACTIVE");
    assert.strictEqual(sm.phase, "ACTIVE");

    sm.transition("EXECUTING");
    assert.strictEqual(sm.phase, "EXECUTING");

    sm.transition("VERIFYING");
    assert.strictEqual(sm.phase, "VERIFYING");

    // Failure branch
    sm.transition("FAILED");
    assert.strictEqual(sm.phase, "FAILED");

    // Recovery
    sm.transition("EXECUTING");
    assert.strictEqual(sm.phase, "EXECUTING");

    sm.transition("VERIFYING");
    
    // Success branch
    sm.transition("COMPLETED");
    assert.strictEqual(sm.phase, "COMPLETED");

    // Invalid transitions
    const sm2 = new StateMachine("PLANNED");
    assert.throws(() => {
        sm2.transition("COMPLETED");
    }, /Invalid transition/);

    const sm3 = new StateMachine("COMPLETED");
    assert.throws(() => {
        sm3.transition("EXECUTING");
    }, /Invalid transition/);

    console.log("StateMachine tests passed!");
}

runTests();
