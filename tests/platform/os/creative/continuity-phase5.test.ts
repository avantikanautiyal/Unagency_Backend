/**
 * Track A Phase A5 — campaign compounding memory tests.
 */

import {
  BrandKnowledgeResolver,
  BrandMemoryPromoteService,
  CampaignMemoryService,
  CROSS_SERVICE_REUSE_PATH,
  InMemoryBrandMemoryStore,
  InMemoryCampaignMemoryStore,
  crossServiceOptionalSlots,
  detectIntentGateFromBrief,
  resolveCampaignMemoryRollout,
  runContinuityBindPipeline,
} from "../../../../src/platform/os/creative";

describe("Track A Phase A5 campaign compounding", () => {
  afterEach(() => {
    delete process.env.CONTINUITY_CAMPAIGN_MEMORY;
    delete process.env.CONTINUITY_CONTEXT_BIND;
    delete process.env.CONTINUITY_APPROVE_PROMOTE;
  });

  it("defaults CONTINUITY_CAMPAIGN_MEMORY to off", () => {
    expect(resolveCampaignMemoryRollout({})).toBe("off");
  });

  it("promotes approved pack to working campaign and archives prior working", async () => {
    process.env.CONTINUITY_CAMPAIGN_MEMORY = "on";
    const brandStore = new InMemoryBrandMemoryStore();
    const campaignStore = new InMemoryCampaignMemoryStore();
    const svc = new CampaignMemoryService(campaignStore, brandStore, () => "on");

    const first = await svc.promotePackToWorking({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_spring",
      title: "Spring",
      executionId: "exec_1",
      leafAssetIds: ["asset_a"],
      slotPointers: [
        {
          slotKey: "campaignLook",
          version: 1,
          tier: "working",
          assetId: "look_spring",
          provenance: "Spring look",
        },
      ],
      nowIso: "2026-08-25T10:00:00.000Z",
    });
    expect(first?.status).toBe("working");

    const second = await svc.promotePackToWorking({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_diwali",
      title: "Diwali",
      executionId: "exec_2",
      leafAssetIds: ["asset_b"],
      slotPointers: [
        {
          slotKey: "campaignLook",
          version: 1,
          tier: "working",
          assetId: "look_diwali",
          provenance: "Diwali look",
        },
      ],
      nowIso: "2026-08-25T11:00:00.000Z",
    });
    expect(second?.campaignId).toBe("camp_diwali");

    const prior = await campaignStore.getPack("camp_spring", "org_a5");
    expect(prior?.status).toBe("archived");

    const active = await campaignStore.getActiveWorkingPack("brand_a5", "org_a5");
    expect(active?.campaignId).toBe("camp_diwali");

    const workingLook = await brandStore.getWorking(
      "brand_a5",
      "org_a5",
      "campaignLook"
    );
    expect(workingLook?.assetId).toBe("look_diwali");
  });

  it("records selection signals (what humans picked)", async () => {
    const campaignStore = new InMemoryCampaignMemoryStore();
    const svc = new CampaignMemoryService(
      campaignStore,
      new InMemoryBrandMemoryStore(),
      () => "on"
    );
    await svc.promotePackToWorking({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_1",
      executionId: "exec_sel",
      nowIso: "2026-08-25T10:00:00.000Z",
    });
    const signal = await svc.recordSelectionSignal({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_1",
      executionId: "exec_sel",
      artifactId: "art_1",
      artifactVersion: 2,
      kind: "human_pick",
      service: "social",
      nowIso: "2026-08-25T10:05:00.000Z",
      createId: (p) => `${p}_1`,
    });
    expect(signal?.kind).toBe("human_pick");
    const listed = await campaignStore.listSignals("brand_a5", "org_a5", "camp_1");
    expect(listed).toHaveLength(1);
    const pack = await campaignStore.getPack("camp_1", "org_a5");
    expect(pack?.selectionSignalIds).toContain("sel_1");
  });

  it("match_campaign prefers working campaignLook over canonical", async () => {
    const store = new InMemoryBrandMemoryStore();
    const promote = new BrandMemoryPromoteService(store, () => "on");
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";

    await promote.promoteOnApprove({
      organizationId: "org_a5",
      brandId: "brand_a5",
      artifactId: "art_can",
      artifactVersion: 1,
      executionId: "exec_c",
      approvalReference: "ref",
      slotKey: "campaignLook",
      tier: "canonical",
      assetId: "look_old",
      nowIso: "2026-08-25T09:00:00.000Z",
    });
    await store.put({
      brandId: "brand_a5",
      organizationId: "org_a5",
      slotKey: "campaignLook",
      tier: "working",
      version: 2,
      assetId: "look_new",
      source: { kind: "approval", refId: "campaign:camp_x", at: "2026-08-25T10:00:00.000Z" },
      provenance: "Working Diwali",
      createdAt: "2026-08-25T10:00:00.000Z",
    });

    const intent = detectIntentGateFromBrief("Like last campaign but for Diwali", {
      logoRole: "none",
    });
    // Prefer working campaign look via resolve option — not brief regex.
    const intentWithCampaign = {
      ...intent,
      intentTags: [...intent.intentTags.filter((t) => t !== "unspecified"), "match_campaign"],
      requiredSlots: ["campaignLook" as const],
    };
    const resolver = new BrandKnowledgeResolver(store);
    const resolved = await resolver.resolve({
      brandId: "brand_a5",
      organizationId: "org_a5",
      intent: intentWithCampaign,
      preferWorkingCampaignLook: true,
    });
    expect(resolved.assets[0]?.assetId).toBe("look_new");
  });

  it("cross-service carry slots follow logo→…→web path", () => {
    expect(CROSS_SERVICE_REUSE_PATH[0]).toBe("logo");
    expect(crossServiceOptionalSlots("social")).toEqual(
      expect.arrayContaining(["logo", "campaignLook"])
    );
    expect(crossServiceOptionalSlots("website")).toEqual(
      expect.arrayContaining(["logo", "wordmark"])
    );
  });

  it("rebrand archives canonical set without mixing", async () => {
    const brandStore = new InMemoryBrandMemoryStore();
    const campaignStore = new InMemoryCampaignMemoryStore();
    const promote = new BrandMemoryPromoteService(brandStore, () => "on");
    const campaign = new CampaignMemoryService(campaignStore, brandStore, () => "on");

    await promote.promoteOnApprove({
      organizationId: "org_a5",
      brandId: "brand_a5",
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_logo",
      approvalReference: "ref",
      slotKey: "logo",
      assetId: "vault_logo",
      nowIso: "2026-08-25T09:00:00.000Z",
    });
    await campaign.promotePackToWorking({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_old",
      executionId: "exec_camp",
      nowIso: "2026-08-25T09:30:00.000Z",
    });

    const result = await campaign.archiveCanonicalSet({
      organizationId: "org_a5",
      brandId: "brand_a5",
      executionId: "exec_rebrand",
      reason: "full rebrand",
      nowIso: "2026-08-25T12:00:00.000Z",
    });
    expect(result?.archivedSlots).toContain("logo");
    expect(await brandStore.getCanonical("brand_a5", "org_a5", "logo")).toBeUndefined();
    expect(
      (await campaignStore.getPack("camp_old", "org_a5"))?.status
    ).toBe("archived");
  });

  it("bind pipeline attaches active campaign when A5 on", async () => {
    process.env.CONTINUITY_CONTEXT_BIND = "on";
    process.env.CONTINUITY_CAMPAIGN_MEMORY = "on";
    process.env.CONTINUITY_APPROVE_PROMOTE = "on";

    const brandStore = new InMemoryBrandMemoryStore();
    const campaignStore = new InMemoryCampaignMemoryStore();
    const promote = new BrandMemoryPromoteService(brandStore, () => "on");
    const campaignSvc = new CampaignMemoryService(
      campaignStore,
      brandStore,
      () => "on"
    );

    await promote.promoteOnApprove({
      organizationId: "org_a5",
      brandId: "brand_a5",
      artifactId: "art_logo",
      artifactVersion: 1,
      executionId: "exec_logo",
      approvalReference: "ref",
      slotKey: "logo",
      assetId: "vault_logo",
      nowIso: "2026-08-25T09:00:00.000Z",
    });
    await campaignSvc.promotePackToWorking({
      organizationId: "org_a5",
      brandId: "brand_a5",
      campaignId: "camp_live",
      title: "Live",
      executionId: "exec_camp",
      slotPointers: [
        {
          slotKey: "campaignLook",
          version: 1,
          tier: "working",
          assetId: "look_live",
          provenance: "Live look",
        },
      ],
      nowIso: "2026-08-25T10:00:00.000Z",
    });

    const out = await runContinuityBindPipeline({
      brief: "Make a social post using our logo",
      brandId: "brand_a5",
      organizationId: "org_a5",
      metadata: { brandId: "brand_a5", service: "social" },
      resolver: new BrandKnowledgeResolver(brandStore),
      campaignMemory: campaignSvc,
      rollout: "on",
    });
    expect(out?.applied).toBe(true);
    expect(out?.metadata.campaignId).toBe("camp_live");
    expect(out?.metadata.assetIds).toEqual(
      expect.arrayContaining(["vault_logo"])
    );
  });
});
