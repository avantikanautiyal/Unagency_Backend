import { SessionStateMachine } from "../../../../../src/platform/intelligence/providers/runtime/sessions/session-state-machine";
import {
  isTerminalProviderExecutionStatus,
  canTransitionProviderExecutionStatus,
} from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-status";

describe("SessionStateMachine", () => {
  it("allows the full happy-path lifecycle", () => {
    const machine = new SessionStateMachine();
    expect(machine.transition("queued").ok).toBe(true);
    expect(machine.transition("reserved").ok).toBe(true);
    expect(machine.transition("dispatching").ok).toBe(true);
    expect(machine.transition("waiting").ok).toBe(true);
    expect(machine.transition("streaming").ok).toBe(true);
    expect(machine.transition("completed").ok).toBe(true);
  });

  it("rejects illegal transitions", () => {
    const machine = new SessionStateMachine();
    expect(machine.transition("streaming").ok).toBe(false);
    const terminal = new SessionStateMachine("completed");
    expect(terminal.canTransition("failed")).toBe(false);
  });

  it("identifies terminal states", () => {
    expect(isTerminalProviderExecutionStatus("completed")).toBe(true);
    expect(isTerminalProviderExecutionStatus("failed")).toBe(true);
    expect(isTerminalProviderExecutionStatus("cancelled")).toBe(true);
    expect(isTerminalProviderExecutionStatus("timed_out")).toBe(true);
    expect(isTerminalProviderExecutionStatus("dispatching")).toBe(false);
  });

  it("permits dispatching to terminal shortcuts", () => {
    expect(canTransitionProviderExecutionStatus("dispatching", "completed")).toBe(true);
    expect(canTransitionProviderExecutionStatus("queued", "streaming")).toBe(false);
  });
});
