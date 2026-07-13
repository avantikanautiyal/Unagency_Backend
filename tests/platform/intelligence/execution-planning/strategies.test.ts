import { DefaultRetryStrategy } from "../../../../src/platform/intelligence/execution-planning/strategies/placeholders/default-strategies";
import { DefaultTimeoutStrategy } from "../../../../src/platform/intelligence/execution-planning/strategies/placeholders/default-strategies";
import { asCapabilityId, asOrganizationId, asWorkspaceId } from "../../../../src/platform/intelligence/shared/identifiers";
import type { PlanningContext } from "../../../../src/platform/intelligence/execution-planning/contracts/planning-context";
import { createPlanningFixture } from "./helpers";

describe("Strategy placeholders", () => {
  it("plans retry and timeout from capability defaults", async () => {
    const { capabilityRegistry } = createPlanningFixture();
    const capability = capabilityRegistry.resolve(asCapabilityId("analyzeBrief"));
    expect(capability.ok).toBe(true);
    if (!capability.ok) return;

    const context: PlanningContext = {
      request: {
        capabilityId: asCapabilityId("analyzeBrief"),
        organizationId: asOrganizationId("org"),
        workspaceId: asWorkspaceId("ws"),
      },
      capability: capability.value,
      candidateProviders: [],
      policyDecisions: [],
      priority: "normal",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const retry = await new DefaultRetryStrategy().plan(context);
    const timeout = await new DefaultTimeoutStrategy().plan(context);

    expect(retry.ok).toBe(true);
    expect(timeout.ok).toBe(true);
    if (timeout.ok) {
      expect(timeout.value.timeoutMs).toBe(30_000);
    }
  });
});
