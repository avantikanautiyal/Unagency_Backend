/**
 * Declarative relevance for brand-fact projection into CanonicalBrandContext.
 * Uses phase contract modality / uxType + intent tags — never serviceId/phaseId branches.
 */

export type BrandFactRelevanceCategory =
  | "identity"
  | "copy"
  | "visual"
  | "campaign"
  | "constraint"
  | "always";

/**
 * Maps persisted / packet fact keys to semantic relevance categories.
 * Unknown keys default to "always" so enrichment is not silently dropped
 * unless a category filter is active and the key is known-irrelevant.
 */
export const BRAND_FACT_RELEVANCE: Readonly<
  Record<string, readonly BrandFactRelevanceCategory[]>
> = Object.freeze({
  brandName: Object.freeze(["identity", "always"] as const),
  positioning: Object.freeze(["copy", "always"] as const),
  voice: Object.freeze(["copy"] as const),
  personality: Object.freeze(["copy"] as const),
  brandTone: Object.freeze(["copy"] as const),
  toneAdjectives: Object.freeze(["copy"] as const),
  tone: Object.freeze(["copy"] as const),
  writingStyle: Object.freeze(["copy"] as const),
  voiceGuidelines: Object.freeze(["copy"] as const),
  targetAudience: Object.freeze(["copy", "always"] as const),
  industry: Object.freeze(["copy", "always"] as const),
  brandSummary: Object.freeze(["copy"] as const),
  guidelines: Object.freeze(["copy", "constraint"] as const),
  messagingGuidance: Object.freeze(["copy"] as const),
  claims: Object.freeze(["copy", "constraint"] as const),
  exclusions: Object.freeze(["constraint"] as const),
  brandColors: Object.freeze(["visual", "always"] as const),
  colors: Object.freeze(["visual", "always"] as const),
  typography: Object.freeze(["visual"] as const),
  photographyStyle: Object.freeze(["visual"] as const),
  illustrationStyle: Object.freeze(["visual"] as const),
  iconStyle: Object.freeze(["visual"] as const),
  logoRules: Object.freeze(["visual"] as const),
  spacingRules: Object.freeze(["visual"] as const),
  layoutGuidance: Object.freeze(["visual"] as const),
  visualStyle: Object.freeze(["visual"] as const),
  socialStyle: Object.freeze(["visual", "copy"] as const),
  campaignLook: Object.freeze(["campaign", "visual"] as const),
  campaignTitle: Object.freeze(["campaign"] as const),
});

export type BrandFactProjectionContext = {
  readonly generationModality?: string;
  readonly uxType?: string;
  /** Continuity / intent-gate tags already stamped on metadata. */
  readonly intentTags?: readonly string[];
};

/**
 * Categories active for the current creation intent + CDF phase contract.
 * Mirrors the declarative phase-scope category approach (modality/ux), not IDs.
 */
export function brandFactCategoriesForProjection(
  ctx: BrandFactProjectionContext,
): ReadonlySet<BrandFactRelevanceCategory> {
  const cats = new Set<BrandFactRelevanceCategory>([
    "identity",
    "always",
    "constraint",
  ]);
  const m = (ctx.generationModality ?? "").trim().toLowerCase();
  const ux = (ctx.uxType ?? "").trim().toLowerCase();
  const tags = new Set((ctx.intentTags ?? []).map((t) => t.trim().toLowerCase()));

  const visual =
    m === "image" ||
    m === "video" ||
    m === "hybrid" ||
    m === "structured" ||
    ux === "visual" ||
    ux === "deck" ||
    ux === "mockup" ||
    ux === "multi_visual" ||
    ux === "generate";
  const copy =
    m === "text" ||
    m === "structured" ||
    ux === "text_approval" ||
    ux === "structured_approval" ||
    ux === "text_choice" ||
    ux === "routes" ||
    ux === "generate" ||
    visual; // visual phases still need voice/positioning for on-image copy

  if (copy) cats.add("copy");
  if (visual) {
    cats.add("visual");
    cats.add("campaign");
  }
  if (tags.has("match_campaign") || tags.has("reuse_colors") || tags.has("reuse_type")) {
    cats.add("visual");
    cats.add("campaign");
  }
  if (tags.has("reuse_voice")) {
    cats.add("copy");
  }

  return cats;
}

export function isBrandFactRelevantForProjection(
  factKey: string,
  ctx: BrandFactProjectionContext,
): boolean {
  const allowed = brandFactCategoriesForProjection(ctx);
  const declared = BRAND_FACT_RELEVANCE[factKey];
  if (!declared) {
    // Unknown enrichment keys: include when copy or visual surface is active
    // (bounded packet already caps volume); never dump-only when modality is none.
    const m = (ctx.generationModality ?? "").trim().toLowerCase();
    if (m === "none") return factKey === "brandName";
    return allowed.has("copy") || allowed.has("visual");
  }
  return declared.some((c) => allowed.has(c));
}
