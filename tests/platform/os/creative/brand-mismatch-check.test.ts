/**
 * Brand mismatch check — production-safe pre-generation ASK.
 */

import {
  applyConfirmedBrandId,
  clientBrandMismatchChoice,
  detectBrandMismatchInBrief,
  findBrandMentions,
  isBrandSubjectMention,
  isColorWordUsedAsColour,
  isComparisonBrandMention,
  resolveBrandMismatchChoice,
  runBrandMismatchCheck,
  shouldCountBrandMention,
  type TenantBrandRef,
} from "../../../../src/platform/os/creative/brand-mismatch-check";

const BRAND_A: TenantBrandRef = { id: "brand_a", name: "Acme Co" };
const BRAND_B: TenantBrandRef = { id: "brand_b", name: "Nova Labs" };
const BRAND_C: TenantBrandRef = { id: "brand_c", name: "Pixel Forge" };
const BRAND_BLUE: TenantBrandRef = { id: "brand_blue", name: "Blue" };
const BRAND_SUNFLOWER: TenantBrandRef = { id: "brand_sun", name: "Sunflower" };

const TENANT_BRANDS = [BRAND_A, BRAND_B, BRAND_C];
const TENANT_WITH_COLOR_NAMES = [
  BRAND_SUNFLOWER,
  BRAND_BLUE,
  { id: "brand_gold", name: "Gold" },
];

describe("brand mismatch detection", () => {
  it("1. matching brand → no ASK", () => {
    const detection = detectBrandMismatchInBrief({
      brief: "Create a social post for Acme Co summer sale",
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
    });
    expect(detection.kind).toBe("none");
  });

  it("2. different known brand → mismatch (ASK before provider)", () => {
    const detection = detectBrandMismatchInBrief({
      brief: "Design a logo for Nova Labs product launch",
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
    });
    expect(detection.kind).toBe("mismatch");
    if (detection.kind === "mismatch") {
      expect(detection.detected.id).toBe(BRAND_B.id);
      expect(detection.selected.id).toBe(BRAND_A.id);
    }
  });

  it("6. comparison / example mention → no false mismatch", () => {
    const cases = [
      "Make an Acme Co ad that feels like Nova Labs",
      "Acme Co campaign inspired by Nova Labs aesthetic",
      "Acme Co post similar to Nova Labs",
      "Acme Co vs Nova Labs style exploration for Acme Co",
      "Create for Acme Co, e.g. Nova Labs energy but keep Acme Co",
    ];
    for (const brief of cases) {
      const detection = detectBrandMismatchInBrief({
        brief,
        selectedBrandId: BRAND_A.id,
        brands: TENANT_BRANDS,
      });
      // Subject is Acme; Nova only appears in comparison windows.
      expect(detection.kind).toBe("none");
    }
  });

  it("flags ambiguous multi-brand subjects", () => {
    const detection = detectBrandMismatchInBrief({
      brief: "Create assets for Nova Labs and Pixel Forge jointly",
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
    });
    expect(detection.kind).toBe("ambiguous");
    if (detection.kind === "ambiguous") {
      expect(detection.candidates.map((c) => c.id).sort()).toEqual(
        [BRAND_B.id, BRAND_C.id].sort()
      );
    }
  });

  it("never matches brands outside the tenant catalog", () => {
    const detection = detectBrandMismatchInBrief({
      brief: "Design a logo for Outside Brand Inc",
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
    });
    expect(detection.kind).toBe("none");
  });

  it("marks comparison prefixes correctly", () => {
    const brief = "Make something like Nova Labs";
    const hits = findBrandMentions(brief, "Nova Labs");
    expect(hits.length).toBe(1);
    expect(hits[0]!.comparison).toBe(true);
    expect(isComparisonBrandMention(brief, hits[0]!.index, hits[0]!.length)).toBe(
      true
    );
  });

  it("does not treat colour words in a brief as a tenant brand named Blue", () => {
    const brief =
      "Create a minimalist logo with blue and gold accents for our oat milk brand";
    const detection = detectBrandMismatchInBrief({
      brief,
      selectedBrandId: BRAND_SUNFLOWER.id,
      brands: TENANT_WITH_COLOR_NAMES,
    });
    expect(detection.kind).toBe("none");
  });

  it("does not flag lowercase blue in a palette list", () => {
    const brief = "Logo design using navy blue, cream, and sunflower yellow";
    expect(
      detectBrandMismatchInBrief({
        brief,
        selectedBrandId: BRAND_SUNFLOWER.id,
        brands: TENANT_WITH_COLOR_NAMES,
      }).kind
    ).toBe("none");
  });

  it("still flags a real subject mention for a colour-word brand name", () => {
    const brief = "Design a full brand identity for Blue coffee roasters";
    const detection = detectBrandMismatchInBrief({
      brief,
      selectedBrandId: BRAND_SUNFLOWER.id,
      brands: TENANT_WITH_COLOR_NAMES,
    });
    expect(detection.kind).toBe("mismatch");
    if (detection.kind === "mismatch") {
      expect(detection.detected.id).toBe(BRAND_BLUE.id);
    }
  });

  it("requires brand-subject cues for colour-word catalog names", () => {
    const brief = "Create a blue wordmark with clean typography";
    const hits = findBrandMentions(brief, "Blue");
    expect(hits.length).toBe(1);
    expect(
      shouldCountBrandMention({
        brief,
        brandName: "Blue",
        matchIndex: hits[0]!.index,
        matchLength: hits[0]!.length,
        comparison: false,
      })
    ).toBe(false);
    expect(isBrandSubjectMention(brief, hits[0]!.index, hits[0]!.length)).toBe(
      false
    );
    expect(
      isColorWordUsedAsColour(
        brief,
        hits[0]!.index,
        hits[0]!.length,
        "Blue"
      )
    ).toBe(true);
  });
});

describe("brand mismatch choice → execution.brandId", () => {
  const detection = detectBrandMismatchInBrief({
    brief: "Design a logo for Nova Labs product launch",
    selectedBrandId: BRAND_A.id,
    brands: TENANT_BRANDS,
  });

  it("3. choose detected brand → correct brandId", () => {
    const resolved = resolveBrandMismatchChoice({
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
      metadata: { brandMismatchChoice: "use_detected" },
      detection,
    });
    expect(resolved).toEqual({
      brandId: BRAND_B.id,
      choice: "use_detected",
      cancelled: false,
      resolved: true,
    });
  });

  it("4. continue selected brand → selected brandId", () => {
    const resolved = resolveBrandMismatchChoice({
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
      metadata: { brandMismatchChoice: "keep_selected" },
      detection,
    });
    expect(resolved).toEqual({
      brandId: BRAND_A.id,
      choice: "keep_selected",
      cancelled: false,
      resolved: true,
    });
  });

  it("5. cancel → cancelled, no generation path", () => {
    const resolved = resolveBrandMismatchChoice({
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
      metadata: { brandMismatchChoice: "cancel" },
      detection,
    });
    expect(resolved?.cancelled).toBe(true);
    expect(clientBrandMismatchChoice({ brandMismatchChoice: "cancel" })).toBe(
      "cancel"
    );
  });

  it("rejects cross-tenant brandId override", () => {
    const resolved = resolveBrandMismatchChoice({
      selectedBrandId: BRAND_A.id,
      brands: TENANT_BRANDS,
      metadata: {
        brandMismatchChoice: "use_brand:other_tenant_brand",
        brandId: "other_tenant_brand",
      },
      detection,
    });
    expect(resolved).toBeNull();
  });

  it("7. prompt / AI output can never override confirmed brandId", () => {
    const confirmed = applyConfirmedBrandId(
      {
        brandId: BRAND_A.id,
        inferredBrandId: BRAND_B.id,
        detectedBrandId: BRAND_B.id,
        brandName: "Nova Labs",
      },
      BRAND_A.id
    );
    expect(confirmed.brandId).toBe(BRAND_A.id);
    expect(confirmed.brandConfirmed).toBe(true);
    expect(confirmed.inferredBrandId).toBeUndefined();
    expect(confirmed.detectedBrandId).toBeUndefined();
  });
});

describe("runBrandMismatchCheck integration", () => {
  const listBrands = async () => TENANT_BRANDS;

  it("matching brand proceeds without ASK", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Create a social post for Acme Co",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
    });
    expect(result).toEqual({
      ask: false,
      brandId: BRAND_A.id,
      brandConfirmed: false,
    });
  });

  it("different known brand returns ASK before provider", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Design a logo for Nova Labs",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
    });
    expect(result?.ask).toBe(true);
    if (result?.ask) {
      expect(result.blockGenerate).toBe(true);
      expect(result.prompt.code).toBe("CONTINUITY_BRAND_MISMATCH");
      expect(result.prompt.message).toContain("Nova Labs");
      expect(result.prompt.message).toContain("Acme Co");
      expect(result.prompt.choices.map((c) => c.id)).toEqual([
        "use_detected",
        "keep_selected",
        "cancel",
      ]);
    }
  });

  it("choose detected → confirmed brand B for context + vault", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Design a logo for Nova Labs",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
      metadata: { brandMismatchChoice: "use_detected" },
    });
    expect(result).toEqual({
      ask: false,
      brandId: BRAND_B.id,
      brandConfirmed: true,
      choice: "use_detected",
    });
  });

  it("continue selected → confirmed brand A", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Design a logo for Nova Labs",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
      metadata: { brandMismatchChoice: "keep_selected" },
    });
    expect(result).toEqual({
      ask: false,
      brandId: BRAND_A.id,
      brandConfirmed: true,
      choice: "keep_selected",
    });
  });

  it("cancel → cancelled flag (no generation / no vault)", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Design a logo for Nova Labs",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
      metadata: { brandMismatchChoice: "cancel" },
    });
    expect(result).toEqual({
      ask: false,
      brandId: BRAND_A.id,
      brandConfirmed: true,
      choice: "cancel",
      cancelled: true,
    });
  });

  it("comparison mention does not ASK", async () => {
    const result = await runBrandMismatchCheck({
      brief: "Acme Co campaign that feels like Nova Labs",
      brandId: BRAND_A.id,
      organizationId: "org_test",
      listBrands,
    });
    expect(result?.ask).toBeFalsy();
    expect(result && "brandId" in result ? result.brandId : null).toBe(
      BRAND_A.id
    );
  });

  it("colour word in brief does not ASK when tenant has brand named Blue", async () => {
    const listColorBrands = async () => TENANT_WITH_COLOR_NAMES;
    const result = await runBrandMismatchCheck({
      brief:
        "Create a warm logo with blue tones and sunflower yellow for packaging",
      brandId: BRAND_SUNFLOWER.id,
      organizationId: "org_test",
      listBrands: listColorBrands,
    });
    expect(result?.ask).toBeFalsy();
    expect(result && "brandId" in result ? result.brandId : null).toBe(
      BRAND_SUNFLOWER.id
    );
  });
});
