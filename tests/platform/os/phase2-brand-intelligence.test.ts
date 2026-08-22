/**
 * Phase 2 — Brand Intelligence unit tests.
 */

import {
  createBrandIntelligenceEngine,
  InMemoryBrandRecordSource,
  renderBrandContextBlock,
  composeBrandAwarePrompt,
  selectBrandContextForTask,
  resolveBrandTaskKind,
  sectionsForTask,
  validateBrandContext,
  BrandIntelligenceError,
  emptyBrandContext,
  type BrandContext,
  type BrandRecord,
} from "../../../src/platform/os/brand";
import { toProviderExecutionRequest } from "../../../src/platform/intelligence/integration/adapters/request-adapters";
import { asCapabilityId } from "../../../src/platform/intelligence/shared/identifiers";

function brandRecord(
  overrides: Partial<BrandRecord> & Pick<BrandRecord, "brandId" | "organizationId" | "name">
): BrandRecord {
  return {
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 2 — Brand Intelligence context generation", () => {
  it("builds READY context from tone/voice/positioning", async () => {
    const source = new InMemoryBrandRecordSource();
    source.upsert(
      brandRecord({
        brandId: "brand_a",
        organizationId: "org_a",
        name: "Playful Co",
        voice: "friendly",
        positioning: "accessible",
        colors: ["#FF00AA", "#00FFCC"],
        guidelinesProfile: {
          tone: "playful and energetic",
          writingStyle: "short punchy lines",
          preferredVocabulary: ["delight", "spark"],
          wordsToAvoid: ["synergy"],
          photographyStyle: "colorful lifestyle",
        },
      })
    );
    const eng = createBrandIntelligenceEngine({ source });
    const ctx = await eng.getContext({
      organizationId: "org_a",
      brandId: "brand_a",
      executionId: "exec_1",
      requestId: "req_1",
      briefIntent: "campaign",
    });
    expect(["READY", "PARTIAL"]).toContain(ctx.status);
    expect(ctx.tone.tone).toBe("playful and energetic");
    expect(ctx.positioning.statement).toBe("accessible");
    expect(ctx.visualIdentity.colors).toEqual(
      expect.arrayContaining(["#FF00AA", "#00FFCC"])
    );
    expect(ctx.provenance.some((p) => p.field === "tone" && p.source === "BRAND_GUIDELINES")).toBe(
      true
    );
    expect(ctx.brandVersion).toBeTruthy();
    expect(ctx.contextHash).toMatch(/^bch_/);
  });

  it("returns MISSING empty context without inventing tone", async () => {
    const eng = createBrandIntelligenceEngine({
      source: new InMemoryBrandRecordSource(),
    });
    const ctx = await eng.getContext({
      organizationId: "org_b",
      executionId: "exec_1",
      requestId: "req_1",
    });
    expect(ctx.status).toBe("MISSING");
    expect(ctx.tone.tone).toBeUndefined();
    expect(renderBrandContextBlock(ctx)).toMatch(/unbranded/i);
    expect(renderBrandContextBlock(ctx)).not.toMatch(/playful/i);
    // Signal-or-silence: EMPTY/MISSING must not dilute the user brief.
    const brief = "Pitch deck in terracotta and cream.";
    expect(composeBrandAwarePrompt(brief, ctx)).toBe(brief);
  });

  it("returns EMPTY brand when brand exists but has no intelligence fields", async () => {
    const source = new InMemoryBrandRecordSource();
    source.upsert(
      brandRecord({
        brandId: "brand_empty",
        organizationId: "org_a",
        name: "Shell Brand",
      })
    );
    const eng = createBrandIntelligenceEngine({ source });
    const ctx = await eng.getContext({
      organizationId: "org_a",
      brandId: "brand_empty",
      executionId: "e1",
      requestId: "r1",
    });
    // Name alone counts as identity complete → PARTIAL overall with missing tone/voice
    expect(["EMPTY", "PARTIAL"]).toContain(ctx.status);
    expect(ctx.tone.tone).toBeUndefined();
    expect(ctx.missingInformation.some((m) => m.key === "tone")).toBe(true);
  });

  it("rejects cross-tenant brand id (missing, not other org data)", async () => {
    const source = new InMemoryBrandRecordSource();
    source.upsert(
      brandRecord({
        brandId: "brand_a",
        organizationId: "org_a",
        name: "A",
        guidelinesProfile: { tone: "secret-tone-org-a" },
      })
    );
    const eng = createBrandIntelligenceEngine({ source });
    const ctx = await eng.getContext({
      organizationId: "org_b",
      brandId: "brand_a",
      executionId: "e1",
      requestId: "r1",
    });
    expect(ctx.status).toBe("MISSING");
    expect(JSON.stringify(ctx)).not.toMatch(/secret-tone-org-a/);
  });
});

describe("Phase 2 — task-specific brand sections", () => {
  it("maps copy vs image vs website sections", () => {
    expect(sectionsForTask("copy")).toEqual(
      expect.arrayContaining(["tone", "voice", "messaging", "vocabulary"])
    );
    expect(sectionsForTask("image")).toEqual(
      expect.arrayContaining(["visualIdentity", "creativePrinciples"])
    );
    expect(sectionsForTask("website")).toEqual(
      expect.arrayContaining(["visualIdentity", "positioning", "messaging"])
    );
    expect(resolveBrandTaskKind({ capabilityId: "image.generate" })).toBe("image");
  });

  it("selectBrandContextForTask strips irrelevant visual for caption", async () => {
    const source = new InMemoryBrandRecordSource();
    source.upsert(
      brandRecord({
        brandId: "b1",
        organizationId: "o1",
        name: "N",
        guidelinesProfile: {
          tone: "formal",
          photographyStyle: "dark moody",
        },
        colors: ["#111"],
      })
    );
    const eng = createBrandIntelligenceEngine({ source });
    const full = await eng.getContext({
      organizationId: "o1",
      brandId: "b1",
      executionId: "e1",
      requestId: "r1",
      briefIntent: "copy",
    });
    const selected = selectBrandContextForTask(full, "copy");
    expect(selected.tone.tone).toBe("formal");
    // copy path still may keep empty visualIdentity object — photography not required
    expect(selected.visualIdentity.photographyStyle).toBeUndefined();
  });
});

describe("Phase 2 — provider-bound brand rendering", () => {
  it("BrandContext reaches provider payload.prompt via toProviderExecutionRequest", async () => {
    const source = new InMemoryBrandRecordSource();
    source.upsert(
      brandRecord({
        brandId: "brand_formal",
        organizationId: "org_a",
        name: "Formal Co",
        guidelinesProfile: { tone: "formal and authoritative" },
      })
    );
    const eng = createBrandIntelligenceEngine({ source });
    const ctx = await eng.getContext({
      organizationId: "org_a",
      brandId: "brand_formal",
      executionId: "e1",
      requestId: "r1",
      briefIntent: "copy",
    });
    const userPrompt = "Write a product announcement.";
    const providerPrompt = composeBrandAwarePrompt(userPrompt, ctx);
    expect(providerPrompt).toMatch(/formal and authoritative/i);
    expect(providerPrompt).toMatch(/Formal Co/);
    expect(providerPrompt).toMatch(/Write a product announcement/);

    const bag = {
      routing: {
        plan: {
          primary: { providerId: "provider.exa", modelId: "exa/default" },
        },
      },
      task: {
        request: { rawPrompt: providerPrompt },
        capabilityMap: { primary: asCapabilityId("text.generate") },
      },
    };
    const req = toProviderExecutionRequest("test_req", bag as never);
    expect(String(req.payload.prompt)).toMatch(/formal and authoritative/i);
    expect(String(req.payload.prompt)).toMatch(/Write a product announcement/);
    expect(String(req.payload.text)).toMatch(/formal and authoritative/i);
  });

  it("emptyBrandContext is not a sample brand", () => {
    const empty = emptyBrandContext({
      organizationId: "org_x",
      executionId: "e1",
      status: "EMPTY",
    });
    expect(empty.tone.tone).toBeUndefined();
    expect(JSON.stringify(empty)).not.toMatch(/Empower customers/i);
    expect(JSON.stringify(empty)).not.toMatch(/sample/i);
  });

  it("validateBrandContext fails closed on bad status", () => {
    const bad = {
      ...emptyBrandContext({
        organizationId: "o",
        executionId: "e",
        status: "EMPTY",
      }),
      status: "NOT_A_STATUS",
    } as unknown as BrandContext;
    expect(() => validateBrandContext(bad)).toThrow(BrandIntelligenceError);
  });
});
