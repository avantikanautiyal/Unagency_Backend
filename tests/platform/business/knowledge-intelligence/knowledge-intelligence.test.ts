import {
  setupKnowledgeIntelligence,
  sampleBrandBrain,
  KnowledgeSyncBuilder,
  KnowledgeRetrievalBuilder,
} from "../../../../src/platform/business/knowledge-intelligence/testing";
import { createKnowledgeIntelligencePlatform } from "../../../../src/platform/business/knowledge-intelligence/factories/create-knowledge-intelligence-platform";

describe("Organizational Knowledge Intelligence", () => {
  function seedOrg(
    engine: ReturnType<typeof setupKnowledgeIntelligence>["engine"],
    org: {
      organizationId: string;
      brandName: string;
      industry: string;
      tone: readonly string[];
      region: string;
      competitor: string;
    }
  ) {
    const document = sampleBrandBrain(org);
    const sync = engine.syncFromBrandBrain(
      KnowledgeSyncBuilder.create()
        .withOrganization(org.organizationId)
        .withDocument(document)
        .withBrandBrainVersion(1)
        .withChangelog("initial projection")
        .build()
    );
    expect(sync.ok).toBe(true);
    return document;
  }

  it("projects Brand Brain into an entity relationship graph", () => {
    const { engine } = setupKnowledgeIntelligence();
    seedOrg(engine, {
      organizationId: "org_graph",
      brandName: "GraphCo",
      industry: "saas",
      tone: ["clear"],
      region: "US",
      competitor: "Rival",
    });

    const entities = engine.listEntities("org_graph");
    const rels = engine.listRelationships("org_graph");
    expect(entities.ok && entities.value.length).toBeGreaterThan(10);
    expect(rels.ok && rels.value.length).toBeGreaterThan(10);
    expect(entities.ok && entities.value.some((e) => e.type === "product")).toBe(true);
    expect(rels.ok && rels.value.some((r) => r.type === "product_in_campaign")).toBe(
      true
    );
  });

  it("supports relationship traversal, shortest path, and neighborhood", () => {
    const { engine } = setupKnowledgeIntelligence();
    const doc = seedOrg(engine, {
      organizationId: "org_trav",
      brandName: "TravCo",
      industry: "commerce",
      tone: ["warm"],
      region: "EU",
      competitor: "ShopX",
    });

    const productId = `ent_product_${doc.products[0]!.productId}`;
    const audienceId = `ent_audience_${doc.audiences[0]!.audienceId}`;

    const related = engine.relatedEntities("org_trav", productId, { maxDepth: 2 });
    expect(related.ok && related.value.length).toBeGreaterThan(0);

    const path = engine.shortestPath("org_trav", productId, audienceId);
    expect(path.ok && path.value && path.value.length).toBeGreaterThan(0);

    const hood = engine.neighborhood("org_trav", productId, 2);
    expect(hood.ok && hood.value.entities.length).toBeGreaterThan(1);
    expect(hood.ok && hood.value.relationships.length).toBeGreaterThan(0);
  });

  it("assembles structured context with evidence ranking — no prompts", () => {
    const { engine } = setupKnowledgeIntelligence();
    const doc = seedOrg(engine, {
      organizationId: "org_ctx",
      brandName: "CtxCo",
      industry: "fintech",
      tone: ["trustworthy"],
      region: "UK",
      competitor: "Cashly",
    });

    const pack = engine.assembleContext(
      KnowledgeRetrievalBuilder.create()
        .forOrganization("org_ctx")
        .withProduct(doc.products[0]!.productId)
        .withRegion("UK")
        .withCapability("marketing.copy")
        .withMaxDepth(2)
        .build()
    );
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    expect(pack.value.facts.length).toBeGreaterThan(3);
    expect(pack.value.summary.factCount).toBe(pack.value.facts.length);

    const meta = engine.toExecutionMetadata(pack.value);
    const ki = meta.knowledgeIntelligence as {
      containsRawDocuments: boolean;
      containsGeneratedPrompts: boolean;
      containsLlmReasoning: boolean;
    };
    expect(ki.containsRawDocuments).toBe(false);
    expect(ki.containsGeneratedPrompts).toBe(false);
    expect(ki.containsLlmReasoning).toBe(false);
  });

  it("produces different context packages for different organization histories", () => {
    const { engine } = setupKnowledgeIntelligence();
    seedOrg(engine, {
      organizationId: "org_alpha",
      brandName: "AlphaWear",
      industry: "fashion",
      tone: ["elegant"],
      region: "EU",
      competitor: "FastTrend",
    });
    seedOrg(engine, {
      organizationId: "org_beta",
      brandName: "BetaBite",
      industry: "food",
      tone: ["playful"],
      region: "US",
      competitor: "SnackRush",
    });

    const q = { capabilityId: "marketing.copy", maxDepth: 2 };
    const a = engine.assembleContext({ organizationId: "org_alpha", ...q });
    const b = engine.assembleContext({ organizationId: "org_beta", ...q });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const aBrand = a.value.facts.find((f) =>
      JSON.stringify(f.value).includes("AlphaWear")
    );
    const bBrand = b.value.facts.find((f) =>
      JSON.stringify(f.value).includes("BetaBite")
    );
    expect(aBrand).toBeTruthy();
    expect(bBrand).toBeTruthy();
    expect(a.value.relatedEntityIds).not.toEqual(b.value.relatedEntityIds);
  });

  it("records explainability for every returned fact", () => {
    const { engine } = setupKnowledgeIntelligence();
    seedOrg(engine, {
      organizationId: "org_exp",
      brandName: "ExpCo",
      industry: "media",
      tone: ["sharp"],
      region: "US",
      competitor: "Noise",
    });
    const pack = engine.assembleContext({ organizationId: "org_exp" });
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    expect(pack.value.explainability.length).toBe(pack.value.facts.length);
    for (const item of pack.value.explainability) {
      expect(item.whySelected.length).toBeGreaterThan(0);
      expect(item.score).toBeGreaterThan(0);
      expect(item.confidence).toBeGreaterThan(0);
    }
  });

  it("versions graph updates and supports snapshot compare", () => {
    const { engine } = setupKnowledgeIntelligence();
    const doc = seedOrg(engine, {
      organizationId: "org_ver",
      brandName: "Veri",
      industry: "saas",
      tone: ["precise"],
      region: "US",
      competitor: "Other",
    });

    const faq = engine.upsertEntity({
      organizationId: "org_ver",
      changelog: "add faq entity",
      entity: {
        entityId: "ent_faq_1",
        organizationId: "org_ver",
        type: "faq",
        name: "Pricing FAQ",
        attributes: { q: "How priced?", a: "Annual" },
        tags: ["faq"],
        confidence: 0.9,
        sourceRefs: ["manual:faq"],
      },
    });
    expect(faq.ok).toBe(true);

    const productId = `ent_product_${doc.products[0]!.productId}`;
    const rel = engine.upsertRelationship({
      organizationId: "org_ver",
      changelog: "link faq to product",
      relationship: {
        relationshipId: "krel_faq_prod",
        organizationId: "org_ver",
        type: "product_has_faq",
        fromEntityId: productId,
        toEntityId: "ent_faq_1",
        weight: 0.9,
        confidence: 0.91,
        attributes: {},
      },
    });
    expect(rel.ok && rel.value.version).toBe(1);

    const versions = engine.listSnapshots("org_ver");
    expect(versions.ok && versions.value.length).toBeGreaterThanOrEqual(3);

    const diff = engine.compare("org_ver", 1, versions.ok ? versions.value.length : 3);
    expect(diff.ok && diff.value.entitiesAdded.length).toBeGreaterThan(0);
  });

  it("rejects context assembly without a graph", () => {
    const { engine } = createKnowledgeIntelligencePlatform();
    const missing = engine.assembleContext({ organizationId: "missing" });
    expect(missing.ok).toBe(false);
  });
});
