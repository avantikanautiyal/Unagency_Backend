/**
 * Merge durable brand profile fields (Mongo) into bind facts — within packet budget.
 */

import mongoose from "mongoose";
import Brands from "../../../models/brand.model";
import type { BrandContextFact } from "./brand-context-packet";
import { BRAND_CONTEXT_PACKET_BUDGETS } from "./continuity-budgets";
import type { KnowledgeResolveResult } from "./knowledge-resolver";

export type BrandProfileContext = {
  readonly facts: readonly BrandContextFact[];
  readonly logoAssetId?: string;
};

export async function resolveBrandProfileContext(input: {
  readonly organizationId: string;
  readonly brandId: string;
}): Promise<BrandProfileContext> {
  if (
    !mongoose.isValidObjectId(input.brandId) ||
    !mongoose.isValidObjectId(input.organizationId)
  ) {
    return { facts: [] };
  }

  const doc = await Brands.findOne({
    _id: new mongoose.Types.ObjectId(input.brandId),
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    status: { $ne: "archived" },
  })
    .select(
      "name positioning voice industry targetAudience colors guidelinesProfile logoAssetId"
    )
    .lean();

  if (!doc) return { facts: [] };

  const gp = (doc.guidelinesProfile ?? {}) as Record<string, unknown>;
  const facts: BrandContextFact[] = [];
  const prov = "Brand profile";

  const push = (key: string, value: string | undefined) => {
    const v = value?.trim();
    if (!v || facts.some((f) => f.key === key)) return;
    facts.push({ key, value: v, tier: "canonical", provenance: prov });
  };

  push("brandName", typeof doc.name === "string" ? doc.name : undefined);
  push("positioning", doc.positioning);
  const personality =
    (Array.isArray(gp.personalityKeywords)
      ? (gp.personalityKeywords as unknown[])
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(", ")
      : "") ||
    (typeof gp.brandPersonality === "string" ? gp.brandPersonality : "") ||
    (typeof gp.tone === "string" ? gp.tone : "");
  push("personality", personality || undefined);
  push("voice", personality || doc.voice || undefined);
  push("industry", doc.industry);
  push("targetAudience", doc.targetAudience || (typeof gp.targetAudience === "string" ? gp.targetAudience : undefined));
  push(
    "brandSummary",
    typeof gp.brandSummary === "string"
      ? gp.brandSummary
      : typeof gp.brandStory === "string"
        ? gp.brandStory
        : typeof gp.description === "string"
          ? gp.description
          : undefined
  );

  if (Array.isArray(doc.colors) && doc.colors.length) {
    push("colors", doc.colors.slice(0, 6).join(", "));
  }

  return {
    facts: facts.slice(0, BRAND_CONTEXT_PACKET_BUDGETS.maxFacts),
    logoAssetId:
      doc.logoAssetId != null ? String(doc.logoAssetId) : undefined,
  };
}

export async function resolveBrandProfileFacts(input: {
  readonly organizationId: string;
  readonly brandId: string;
}): Promise<readonly BrandContextFact[]> {
  const ctx = await resolveBrandProfileContext(input);
  return ctx.facts;
}

export function brandProfileFromFacts(
  facts: readonly BrandContextFact[]
): {
  readonly positioning?: string;
  readonly voice?: string;
  readonly industry?: string;
  readonly targetAudience?: string;
  readonly brandSummary?: string;
  readonly brandName?: string;
} {
  const get = (key: string) => facts.find((f) => f.key === key)?.value?.trim();
  return {
    brandName: get("brandName"),
    positioning: get("positioning"),
    voice: get("voice"),
    industry: get("industry"),
    targetAudience: get("targetAudience"),
    brandSummary: get("brandSummary"),
  };
}

/** Slot facts win; profile fills gaps within packet budget. */
export function mergeProfileFactsIntoResolve(
  resolved: KnowledgeResolveResult,
  profileFacts: readonly BrandContextFact[]
): KnowledgeResolveResult {
  if (!profileFacts.length) return resolved;
  const seen = new Set(resolved.facts.map((f) => f.key));
  const merged = [...resolved.facts];
  for (const pf of profileFacts) {
    if (seen.has(pf.key)) continue;
    merged.push(pf);
    seen.add(pf.key);
  }
  return {
    ...resolved,
    facts: merged.slice(0, BRAND_CONTEXT_PACKET_BUDGETS.maxFacts),
    provenanceParts: profileFacts.length
      ? [...resolved.provenanceParts, "Brand profile"]
      : resolved.provenanceParts,
  };
}
