import { ExecutionStateMachine } from "../../../../src/platform/intelligence/execution-runtime/state-machine/execution-state-machine";

describe("ExecutionStateMachine", () => {
  it("allows legal transitions", () => {
    const machine = new ExecutionStateMachine();
    expect(machine.transition("queued").ok).toBe(true);
    expect(machine.transition("preparing").ok).toBe(true);
    expect(machine.transition("running").ok).toBe(true);
    expect(machine.transition("paused").ok).toBe(true);
    expect(machine.transition("running").ok).toBe(true);
    expect(machine.transition("completed").ok).toBe(true);
  });

  it("rejects illegal transitions", () => {
    const machine = new ExecutionStateMachine();
    expect(machine.transition("completed").ok).toBe(false);
    expect(machine.canTransition("running")).toBe(false);
  });
});
