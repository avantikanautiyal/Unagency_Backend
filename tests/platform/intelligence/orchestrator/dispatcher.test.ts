import { ExecutionDispatcher } from "../../../../src/platform/intelligence/orchestrator/dispatcher/execution-dispatcher";
import { createExecutionRuntime } from "../../../../src/platform/intelligence/execution-runtime/factories/create-execution-runtime";
import { InMemoryEventBus } from "../../../../src/platform/intelligence/events/implementations/in-memory-event-bus";
import { EventFactory } from "../../../../src/platform/intelligence/events/implementations/event-factory";
import { SystemClock, UuidGenerator } from "../../../../src/platform/intelligence/shared/utils";
import { samplePlan, sampleRuntimeContext } from "./helpers";

describe("ExecutionDispatcher", () => {
  it("dispatches to runtime via interface", async () => {
    const runtime = createExecutionRuntime({
      eventBus: new InMemoryEventBus(),
      eventFactory: new EventFactory(new UuidGenerator(), new SystemClock()),
    });
    const dispatcher = new ExecutionDispatcher(runtime);
    const result = await dispatcher.dispatch({
      plan: samplePlan(),
      runtimeContext: sampleRuntimeContext(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("completed");
    }
  });

  it("rejects invalid plans", async () => {
    const runtime = createExecutionRuntime({
      eventBus: new InMemoryEventBus(),
      eventFactory: new EventFactory(new UuidGenerator(), new SystemClock()),
    });
    const dispatcher = new ExecutionDispatcher(runtime);
    const plan = samplePlan();
    const result = await dispatcher.dispatch({
      plan: { ...plan, planId: "" },
      runtimeContext: sampleRuntimeContext(),
    });
    expect(result.ok).toBe(false);
  });
});
