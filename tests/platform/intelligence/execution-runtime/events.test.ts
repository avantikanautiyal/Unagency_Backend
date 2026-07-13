import { ExecutionEventTypes } from "../../../../src/platform/intelligence/execution-runtime/events/execution-event-types";
import { createRuntimeFixture, sampleContext, samplePlan } from "./helpers";

describe("Execution events", () => {
  it("publishes created, started, and completed events", async () => {
    const { runtime, events } = createRuntimeFixture();
    await runtime.executePlan({
      context: sampleContext(),
      plan: samplePlan(),
    });

    const types = events.map((e) => e.type);
    expect(types).toContain(ExecutionEventTypes.EXECUTION_CREATED);
    expect(types).toContain(ExecutionEventTypes.EXECUTION_STARTED);
    expect(types).toContain(ExecutionEventTypes.EXECUTION_COMPLETED);
  });

  it("publishes cancelled events", async () => {
    const { runtime, events } = createRuntimeFixture();
    const created = await runtime.createSession({
      context: sampleContext(),
      plan: samplePlan(),
    });
    if (!created.ok) return;
    await created.value.start();
    await runtime.cancelExecution(created.value.sessionId, "stop");

    expect(events.map((e) => e.type)).toContain(
      ExecutionEventTypes.EXECUTION_CANCELLED
    );
  });
});
