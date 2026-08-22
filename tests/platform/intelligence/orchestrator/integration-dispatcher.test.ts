import { IntegrationDispatcher } from "../../../../src/platform/intelligence/orchestrator/dispatcher/integration-dispatcher";
import { createExecutionRuntime } from "../../../../src/platform/intelligence/execution-runtime/factories/create-execution-runtime";
import { InMemoryEventBus } from "../../../../src/platform/intelligence/events/implementations/in-memory-event-bus";
import { EventFactory } from "../../../../src/platform/intelligence/events/implementations/event-factory";
import { SystemClock, UuidGenerator } from "../../../../src/platform/intelligence/shared/utils";
import type { IIntelligenceOsIntegrationEngine } from "../../../../src/platform/intelligence/integration/interfaces/integration";
import { success } from "../../../../src/platform/intelligence/shared/result";
import { samplePlan, sampleRuntimeContext } from "./helpers";

describe("IntegrationDispatcher", () => {
  it("starts session, runs integration, and completes without double-starting", async () => {
    const runtime = createExecutionRuntime({
      eventBus: new InMemoryEventBus(),
      eventFactory: new EventFactory(new UuidGenerator(), new SystemClock()),
    });

    const integration: IIntelligenceOsIntegrationEngine = {
      run: async () =>
        success({
          resultId: "int_result_1",
          success: true,
          stagesCompleted: ["provider"],
          durationMs: 12,
          artifacts: {
            runtime: {
              response: { output: { outputs: [{ kind: "image" }] } },
            },
          },
        }),
      runPostProcessing: async () =>
        success({
          resultId: "int_result_post",
          success: true,
          stagesCompleted: [],
          durationMs: 0,
          artifacts: {},
        }),
    };

    const dispatcher = new IntegrationDispatcher(integration, runtime);
    const result = await dispatcher.dispatch({
      plan: samplePlan(),
      runtimeContext: sampleRuntimeContext(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("completed");
    }
  });

  it("fails session when integration pipeline returns success: false", async () => {
    const runtime = createExecutionRuntime({
      eventBus: new InMemoryEventBus(),
      eventFactory: new EventFactory(new UuidGenerator(), new SystemClock()),
    });

    const integration: IIntelligenceOsIntegrationEngine = {
      run: async () =>
        success({
          resultId: "int_result_2",
          success: false,
          stagesCompleted: [],
          durationMs: 5,
          artifacts: {},
        }),
      runPostProcessing: async () =>
        success({
          resultId: "int_result_post",
          success: false,
          stagesCompleted: [],
          durationMs: 0,
          artifacts: {},
        }),
    };

    const dispatcher = new IntegrationDispatcher(integration, runtime);
    const result = await dispatcher.dispatch({
      plan: samplePlan(),
      runtimeContext: sampleRuntimeContext(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("failed");
    }
  });
});
