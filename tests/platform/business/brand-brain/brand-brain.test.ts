import {
  setupBrandBrain,
  sampleBrandBrain,
} from "../../../../src/platform/business/brand-brain/testing";
import {
  BrandBrainRetrievalBuilder,
  BrandBrainUpsertBuilder,
} from "../../../../src/platform/business/brand-brain/builders/brand-brain-builders";
import { createBrandBrainPlatform } from "../../../../src/platform/business/brand-brain/factories/create-brand-brain-platform";

describe("Brand Brain & Organizational Intelligence", () => {
  it("stores versioned brand brains per organization", () => {
    const { engine } = setupBrandBrain();
    const doc = sampleBrandBrain({
      organizationId: "org_nova",
      brandName: "Nova",
      industry: "saas",
      tone: ["confident", "warm"],
      region: "US",
      competitor: "RivalCo",
    });
    const v1 = engine.upsert(
      BrandBrainUpsertBuilder.create()
        .withOrganization("org_nova")
        .withDocument(doc)
        .withChangelog("initial brain")
        .build()
    );
    expect(v1.ok && v1.value.version).toBe(1);

    const updated = {
      ...doc,
      tone: { ...doc.tone, adjectives: ["bold", "precise"] },
    };
    const v2 = engine.upsert({
      organizationId: "org_nova",
      document: updated,
      changelog: "tone refresh",
    });
    expect(v2.ok && v2.value.version).toBe(2);
    const versions = engine.listVersions("org_nova");
    expect(versions.ok && versions.value.length).toBe(2);
  });

  it("enriches with structured facts only — no prompts or raw documents", () => {
    const { engine } = setupBrandBrain();
    const doc = sampleBrandBrain({
      organizationId: "org_a",
      brandName: "Alpha",
      industry: "retail",
      tone: ["friendly"],
      region: "UK",
      competitor: "BetaMart",
    });
    engine.upsert({
      organizationId: "org_a",
      document: doc,
      changelog: "seed",
    });

    const enrichment = engine.enrich(
      BrandBrainRetrievalBuilder.create()
        .forOrganization("org_a")
        .withCapability("marketing.copy")
        .withDepartment("marketing")
        .withRegion("UK")
        .build()
    );
    expect(enrichment.ok).toBe(true);
    if (!enrichment.ok) return;
    expect(enrichment.value.facts.length).toBeGreaterThan(5);
    expect(enrichment.value.summary.sectionsUsed).toContain("tone");
    expect(enrichment.value.summary.sectionsUsed).toContain("brand_identity");

    const meta = engine.toExecutionMetadata(enrichment.value);
    const bb = meta.brandBrain as {
      containsRawDocuments: boolean;
      containsGeneratedPrompts: boolean;
      facts: unknown[];
    };
    expect(bb.containsRawDocuments).toBe(false);
    expect(bb.containsGeneratedPrompts).toBe(false);
    expect(Array.isArray(bb.facts)).toBe(true);
  });

  it("produces different enrichment for different organizations on the same ask", () => {
    const { engine } = setupBrandBrain();
    engine.upsert({
      organizationId: "org_lux",
      document: sampleBrandBrain({
        organizationId: "org_lux",
        brandName: "LuxeLane",
        industry: "fashion",
        tone: ["elegant", "restrained"],
        region: "EU",
        competitor: "FastTrend",
      }),
      changelog: "lux brain",
    });
    engine.upsert({
      organizationId: "org_bolt",
      document: sampleBrandBrain({
        organizationId: "org_bolt",
        brandName: "BoltBite",
        industry: "food",
        tone: ["playful", "energetic"],
        region: "US",
        competitor: "SnackRush",
      }),
      changelog: "bolt brain",
    });

    const q = { capabilityId: "marketing.copy", department: "marketing" };
    const lux = engine.enrich({ organizationId: "org_lux", ...q });
    const bolt = engine.enrich({ organizationId: "org_bolt", ...q });
    expect(lux.ok && bolt.ok).toBe(true);
    if (!lux.ok || !bolt.ok) return;

    const luxBrand = lux.value.facts.find((f) => f.section === "brand_identity");
    const boltBrand = bolt.value.facts.find((f) => f.section === "brand_identity");
    expect(luxBrand?.value).not.toEqual(boltBrand?.value);

    const luxTone = lux.value.facts.find((f) => f.section === "tone");
    const boltTone = bolt.value.facts.find((f) => f.section === "tone");
    expect(JSON.stringify(luxTone?.value)).toContain("elegant");
    expect(JSON.stringify(boltTone?.value)).toContain("playful");
  });

  it("retrieves audience, competitors, campaign history, localization", () => {
    const { engine } = setupBrandBrain();
    const doc = sampleBrandBrain({
      organizationId: "org_ret",
      brandName: "Retico",
      industry: "commerce",
      tone: ["clear"],
      region: "APAC",
      competitor: "MegaShop",
    });
    engine.upsert({ organizationId: "org_ret", document: doc, changelog: "seed" });

    const pack = engine.enrich({
      organizationId: "org_ret",
      audienceId: doc.audiences[0]!.audienceId,
      campaignId: doc.campaignHistory[0]!.campaignId,
      region: "APAC",
      includeHistoricalPerformance: true,
    });
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    const sections = new Set(pack.value.facts.map((f) => f.section));
    expect(sections.has("audience")).toBe(true);
    expect(sections.has("competitors")).toBe(true);
    expect(sections.has("campaign_history")).toBe(true);
    expect(sections.has("regional_preferences")).toBe(true);
    expect(sections.has("successful_strategies") || sections.has("failed_strategies")).toBe(
      true
    );
  });

  it("supports version compare and rollback", () => {
    const { engine } = setupBrandBrain();
    const doc = sampleBrandBrain({
      organizationId: "org_ver",
      brandName: "Veri",
      industry: "fintech",
      tone: ["trustworthy"],
      region: "US",
      competitor: "Cashly",
    });
    engine.upsert({ organizationId: "org_ver", document: doc, changelog: "v1" });
    engine.upsert({
      organizationId: "org_ver",
      document: {
        ...doc,
        identity: { ...doc.identity, mission: "New mission" },
      },
      changelog: "mission change",
    });

    const diff = engine.compare("org_ver", 1, 2);
    expect(diff.ok && diff.value.changedPaths.length).toBeGreaterThan(0);

    const rolled = engine.rollback("org_ver", 1, "admin");
    expect(rolled.ok && rolled.value.version).toBe(3);
    expect(rolled.ok && rolled.value.document.identity.mission).toContain(
      "Empower customers"
    );
  });

  it("records explainability for every selected fact", () => {
    const { engine } = setupBrandBrain();
    const doc = sampleBrandBrain({
      organizationId: "org_x",
      brandName: "Xylo",
      industry: "media",
      tone: ["sharp"],
      region: "US",
      competitor: "NoiseCo",
    });
    engine.upsert({ organizationId: "org_x", document: doc, changelog: "seed" });
    const pack = engine.enrich({ organizationId: "org_x" });
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    expect(pack.value.explainability.length).toBe(pack.value.facts.length);
    for (const item of pack.value.explainability) {
      expect(item.whySelected.length).toBeGreaterThan(0);
      expect(item.confidence).toBeGreaterThan(0);
      expect(item.score).toBeGreaterThan(0);
    }
  });

  it("rejects enrichment without a brand brain", () => {
    const { engine } = createBrandBrainPlatform();
    const missing = engine.enrich({ organizationId: "missing" });
    expect(missing.ok).toBe(false);
  });
});
