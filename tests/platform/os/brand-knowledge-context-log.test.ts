import type { BrandContext } from "../../../src/platform/os/brand/contracts/brand-context";
import type { KnowledgeContext } from "../../../src/platform/os/knowledge/contracts/knowledge-context";
import {
  collectBrandInjectionRows,
  collectKnowledgeInjectionRows,
  formatBrandKnowledgeContextTable,
} from "../../../src/platform/os/observability/brand-knowledge-context-log";

function sampleBrand(partial?: Partial<BrandContext>): BrandContext {
  return {
    id: "bctx_1",
    version: "1.0.0",
    brandId: "brand_abc",
    organizationId: "org_1",
    brandVersion: "3",
    executionId: "exec_1",
    status: "PARTIAL",
    identity: { name: "Contemporary Fusion", industry: "Food & Beverage" },
    positioning: { statement: "Modern Indian dining" },
    audience: { primary: "Urban millennials" },
    voice: { voice: "Warm expert", writingStyle: "Concise" },
    tone: { tone: "Bold contemporary", adjectives: ["vibrant", "premium"] },
    vocabulary: { preferred: ["fusion"], avoid: ["cheap"] },
    messaging: { guidelines: "Lead with flavor", ctaStyle: "Book now" },
    visualIdentity: {
      colors: ["#C0392B", "#F1C40F"],
      primaryColors: ["#C0392B"],
      typography: "Sans-serif modern",
    },
    creativePrinciples: { aiRules: "No stock clichés" },
    communicationRules: {},
    prohibitedPatterns: ["clip art logos"],
    preferredPatterns: ["geometric motifs"],
    assetReferences: [{ assetId: "asset_logo", type: "logo", name: "Primary logo" }],
    completeness: {
      identity: "complete",
      positioning: "partial",
      voice: "complete",
      tone: "complete",
      messaging: "partial",
      visualIdentity: "partial",
      overall: "PARTIAL",
    },
    missingInformation: [{ key: "photographyStyle", reason: "not set", severity: "recommended" }],
    confidence: { system: 0.82 },
    provenance: [],
    sourceReferences: ["brand_profile"],
    contextGeneratedAt: "2026-08-20T00:00:00.000Z",
    contextHash: "hash_brand_1",
    ...partial,
  };
}

function sampleKnowledge(partial?: Partial<KnowledgeContext>): KnowledgeContext {
  return {
    id: "kctx_1",
    version: "1.0.0",
    organizationId: "org_1",
    executionId: "exec_1",
    brandId: "brand_abc",
    query: "logo design contemporary fusion restaurant",
    status: "READY",
    facts: [
      {
        key: "cuisine",
        value: "Indo-Chinese fusion",
        sourceId: "doc_1",
        provenance: "STRUCTURED_FACT",
        confidence: 0.91,
      },
    ],
    retrievedChunks: [
      {
        chunkId: "chunk_1",
        documentId: "doc_1",
        title: "Brand deck",
        content: "Signature dishes include chili paneer tacos and saffron ramen.",
        retrievalScore: 0.88,
        retrievalMethod: "hybrid",
        sourceType: "CLIENT_PROVIDED",
      },
    ],
    relevantSources: [],
    sourceReferences: ["doc_1"],
    conflicts: [],
    warnings: [],
    completeness: "PARTIAL",
    confidence: { system: 0.75 },
    provenance: [],
    knowledgeVersion: "2",
    retrievedAt: "2026-08-20T00:00:00.000Z",
    contextHash: "hash_knowledge_1",
    ...partial,
  };
}

describe("brand-knowledge-context-log", () => {
  it("collects brand fields injected into prompt context", () => {
    const rows = collectBrandInjectionRows(sampleBrand());
    expect(rows.some((r) => r.field === "Brand name" && r.value.includes("Contemporary Fusion"))).toBe(
      true
    );
    expect(rows.some((r) => r.field === "Tone" && r.value.includes("Bold contemporary"))).toBe(true);
    expect(rows.some((r) => r.field === "Colors" && r.value.includes("#C0392B"))).toBe(true);
  });

  it("collects knowledge facts and chunks", () => {
    const rows = collectKnowledgeInjectionRows(sampleKnowledge());
    expect(rows.some((r) => r.field === "fact:cuisine")).toBe(true);
    expect(rows.some((r) => r.field.startsWith("chunk:"))).toBe(true);
  });

  it("renders a tabular summary with prompt size deltas", () => {
    const table = formatBrandKnowledgeContextTable({
      requestId: "corr_1",
      executionId: "exec_1",
      organizationId: "org_1",
      capabilityId: "image.generate",
      brandId: "brand_abc",
      promptBeforeContext: "Generate a logo for Contemporary Fusion",
      promptAfterBrand: "Generate a logo\n\n[Structured Brand Context]",
      promptAfterKnowledge:
        "Generate a logo\n\n[Structured Brand Context]\n\n[Structured Knowledge Context]",
      brandContext: sampleBrand(),
      knowledgeContext: sampleKnowledge(),
    });

    expect(table).toContain("Brand & Knowledge context injection (per prompt)");
    expect(table).toContain("┌");
    expect(table).toContain("Brand name");
    expect(table).toContain("fact:cuisine");
    expect(table).toContain("prompt:");
    expect(table).toContain("after brand:");
    expect(table).toContain("after knowledge:");
  });

  it("notes empty brand and knowledge states", () => {
    const rowsBrand = collectBrandInjectionRows(
      sampleBrand({ status: "EMPTY", identity: {}, tone: {}, voice: {} })
    );
    expect(rowsBrand.some((r) => r.field === "note")).toBe(true);

    const rowsKnowledge = collectKnowledgeInjectionRows(
      sampleKnowledge({ status: "EMPTY", facts: [], retrievedChunks: [] })
    );
    expect(rowsKnowledge.some((r) => r.field === "note")).toBe(true);
  });
});
