/**
 * Track A Phase A1 — Brand Memory promote + resolve tests.
 */

import {
  BrandMemoryPromoteService,
  InMemoryArtifactVersionStore,
  InMemoryBrandMemoryStore,
  defaultBrandMemoryPromoteService,
  defaultBrandMemoryStore,
} from "../../../../src/platform/os";

describe("Track A Phase A1 Brand Memory", () => {
  const orgId = "org_a1";
  const brandId = "brand_northstar";

  afterEach(() => {
    defaultBrandMemoryStore.clear();
    delete process.env.CONTINUITY_APPROVE_PROMOTE;
  });

  it("does nothing when ApprovePromote rollout is off", async () => {
    const store = new InMemoryBrandMemoryStore();
    const svc = new BrandMemoryPromoteService(store, () => "off");
    const result = await svc.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_1",
      approvalReference: "ref_1",
      slotKey: "logo",
      assetId: "asset_logo_1",
      nowIso: "2026-08-25T00:00:00.000Z",
    });
    expect(result).toBeNull();
    expect(await svc.resolveCanonical(brandId, orgId, "logo")).toBeUndefined();
  });

  it("shadow mode computes provenance but does not persist", async () => {
    const store = new InMemoryBrandMemoryStore();
    const svc = new BrandMemoryPromoteService(store, () => "shadow");
    const result = await svc.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_1",
      approvalReference: "ref_1",
      slotKey: "logo",
      assetId: "asset_logo_1",
      nowIso: "2026-08-25T00:00:00.000Z",
    });
    expect(result?.shadowed).toBe(true);
    expect(result?.provenance).toContain("Logo v1");
    expect(await store.getCanonical(brandId, orgId, "logo")).toBeUndefined();
  });

  it("approve once → resolve canonical.logo by asset id (A1 exit)", async () => {
    const store = new InMemoryBrandMemoryStore();
    const svc = new BrandMemoryPromoteService(store, () => "on");
    const result = await svc.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_1",
      approvalReference: "ref_1",
      slotKey: "logo",
      assetId: "asset_logo_1",
      nowIso: "2026-08-25T12:00:00.000Z",
    });
    expect(result?.version).toBe(1);
    expect(result?.shadowed).toBe(false);

    const canonical = await svc.resolveCanonical(brandId, orgId, "logo");
    expect(canonical?.assetId).toBe("asset_logo_1");
    expect(canonical?.tier).toBe("canonical");
    expect(canonical?.provenance).toContain("approved 2026-08-25");
  });

  it("is idempotent on same artifact@version", async () => {
    const store = new InMemoryBrandMemoryStore();
    const svc = new BrandMemoryPromoteService(store, () => "on");
    const input = {
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 2,
      executionId: "exec_2",
      approvalReference: "ref_2",
      slotKey: "logo" as const,
      assetId: "asset_logo_2",
      nowIso: "2026-08-25T13:00:00.000Z",
    };
    const first = await svc.promoteOnApprove(input);
    const second = await svc.promoteOnApprove(input);
    expect(first?.version).toBe(1);
    expect(second?.idempotentReplay).toBe(true);
    expect(second?.version).toBe(first?.version);
    const history = await store.listSlotHistory(brandId, orgId, "logo");
    expect(history.filter((h) => h.tier === "canonical")).toHaveLength(1);
  });

  it("supersedes previous canonical when a new artifact is promoted", async () => {
    const store = new InMemoryBrandMemoryStore();
    const svc = new BrandMemoryPromoteService(store, () => "on");
    await svc.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_1",
      approvalReference: "ref_1",
      slotKey: "logo",
      assetId: "asset_v1",
      nowIso: "2026-08-25T10:00:00.000Z",
    });
    await svc.promoteOnApprove({
      organizationId: orgId,
      brandId,
      artifactId: "art_logo",
      artifactVersion: 2,
      executionId: "exec_2",
      approvalReference: "ref_2",
      slotKey: "logo",
      assetId: "asset_v2",
      nowIso: "2026-08-25T11:00:00.000Z",
    });
    const canonical = await svc.resolveCanonical(brandId, orgId, "logo");
    expect(canonical?.assetId).toBe("asset_v2");
    expect(canonical?.version).toBe(2);
    const history = await store.listSlotHistory(brandId, orgId, "logo");
    expect(
      history.some((h) => h.tier === "archive" && h.assetId === "asset_v1")
    ).toBe(true);
  });

  it("approveVersion hook promotes when brandMemory hint is set and flag is on", async () => {
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";
    defaultBrandMemoryStore.clear();

    const artifacts = new InMemoryArtifactVersionStore();
    await artifacts.createVersion({
      artifactId: "art_hook",
      organizationId: orgId,
      executionId: "exec_hook",
      preview: "logo-bytes",
    });
    await artifacts.approveVersion({
      artifactId: "art_hook",
      version: 1,
      organizationId: orgId,
      approvalReference: "human_1",
      brandMemory: {
        brandId,
        slotKey: "logo",
        assetId: "vault_logo_9",
      },
    });

    const canonical = await defaultBrandMemoryPromoteService.resolveCanonical(
      brandId,
      orgId,
      "logo"
    );
    expect(canonical?.assetId).toBe("vault_logo_9");
  });

  it("approveVersion without brandMemory does not write memory", async () => {
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";
    defaultBrandMemoryStore.clear();

    const artifacts = new InMemoryArtifactVersionStore();
    await artifacts.createVersion({
      artifactId: "art_plain",
      organizationId: orgId,
      executionId: "exec_plain",
    });
    await artifacts.approveVersion({
      artifactId: "art_plain",
      version: 1,
      organizationId: orgId,
      approvalReference: "human_plain",
    });

    expect(
      await defaultBrandMemoryPromoteService.resolveCanonical(
        brandId,
        orgId,
        "logo"
      )
    ).toBeUndefined();
  });
});
