/**
 * Phase 0 — tenant boundary smoke on enterprise executions (in-memory).
 */

import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

describe("Phase 0 — tenant isolation (execution get)", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("tenant A cannot retrieve tenant B execution", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const platform = runtime.platform;
    const seed = platform.seed;
    expect(seed).toBeDefined();

    const orgA = seed!.organizationId;
    const orgB = platform.tenants.createOrganization("Other Org");
    expect(orgB.ok).toBe(true);
    if (!orgB.ok) return;

    const created = await platform.executions.create(
      {
        prompt: "Phase0 tenant isolation probe",
        capabilityId: "text.generate",
        organizationId: orgA,
        workspaceId: seed!.workspaceId,
      },
      {
        userId: seed!.userId,
        organizationId: orgA,
        roles: ["owner"],
        email: seed!.email,
      } as never
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const got = await platform.executions.get(created.value.executionId, {
      organizationId: orgB.value.organizationId,
    } as never);
    expect(got.ok).toBe(false);
  });
});
