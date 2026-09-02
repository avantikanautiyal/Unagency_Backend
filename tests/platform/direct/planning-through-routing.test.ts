/**
 * planning_through_routing must resolve routing without calling the provider.
 */

import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import { asOrganizationId } from "../../../src/platform/core/identifiers";
import type { IProviderRuntime } from "../../../src/platform/providers/runtime/interfaces/provider-runtime";
import { failure } from "../../../src/platform/core/result";
import { ValidationError } from "../../../src/platform/core/errors";

describe("planning_through_routing", () => {
  it("returns after routing and never calls provider runtime", async () => {
    let executeCalls = 0;
    const runtime: IProviderRuntime = {
      async execute() {
        executeCalls += 1;
        return failure(new ValidationError("provider must not run in planning mode"));
      },
    };

    const engine = createDirectExecutionEngine({ runtime });
    const result = await engine.run({
      requestId: "exec_plan_1",
      rawPrompt: "Generate a logo for a coffee brand",
      organizationId: asOrganizationId("org_test"),
      mode: "planning_through_routing",
      metadata: {
        preferredProviderId: "provider.openai",
        preferredModelId: "gpt-4o",
        capabilityId: "text.generate",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(executeCalls).toBe(0);
    expect(result.value.success).toBe(true);
    expect(result.value.stagesCompleted).toEqual(["routing"]);
    expect(result.value.artifacts.runtime).toBeUndefined();
    expect(result.value.artifacts.routing?.plan.primary.providerId).toBeTruthy();
  });

  it("full mode still invokes the provider runtime", async () => {
    let executeCalls = 0;
    const runtime: IProviderRuntime = {
      async execute(req) {
        executeCalls += 1;
        return {
          ok: true,
          value: {
            requestId: req.requestId,
            sessionId: "sess",
            status: "completed",
            success: true,
            response: {
              requestId: req.requestId,
              providerId: req.providerId,
              output: { text: "ok" },
              streamed: false,
              finishedAt: new Date().toISOString(),
            },
          },
        };
      },
    };

    const engine = createDirectExecutionEngine({ runtime });
    const result = await engine.run({
      requestId: "exec_full_1",
      rawPrompt: "Say hello",
      organizationId: asOrganizationId("org_test"),
      mode: "full",
      metadata: {
        preferredProviderId: "provider.openai",
        preferredModelId: "gpt-4o",
        capabilityId: "text.generate",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(executeCalls).toBeGreaterThanOrEqual(1);
    expect(result.value.stagesCompleted).toContain("provider_runtime");
  });
});
