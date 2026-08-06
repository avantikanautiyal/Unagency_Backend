/**
 * M10.17 — Brand Brain sync bridge.
 *
 * Maps the Mongo product Brand (BrandDto, incl. guidelinesProfile) onto a
 * BrandBrainDocument and persists it via the shared BrandBrainEngine so the
 * Intelligence OS pipeline (execution context, enrichment, prompt
 * compilation) always reflects the latest brand guidelines set by the user.
 *
 * No mock/demo data: every BrandBrainDocument field is derived from what the
 * user actually entered on the Brand / Brand Guidelines screens. Empty
 * arrays/strings are used instead of fabricated placeholder content.
 */

import type { BrandBrainDocument } from "../platform/business/brand-brain/contracts";
import type { IBrandBrainEngine } from "../platform/business/brand-brain/interfaces/brand-brain";
import { createBrandBrainPlatform } from "../platform/business/brand-brain/factories/create-brand-brain-platform";
import type { BrandDto } from "./brand-service";

let fallbackEngine: IBrandBrainEngine | undefined;

/**
 * Resolve the Brand Brain engine backed by the same durable repository the
 * Enterprise API runtime uses (when mounted). Falls back to a process-local
 * engine (in-memory) so brand create/update never fails when the Enterprise
 * API gateway hasn't booted (e.g. legacy-only server process, unit tests).
 *
 * `getEnterpriseApiRuntime` is imported dynamically to avoid a static
 * circular dependency (the runtime bootstrap chain itself constructs the
 * live business context stores, which read this module).
 */
export async function resolveBrandBrainEngine(): Promise<IBrandBrainEngine> {
  const { getEnterpriseApiRuntime } = await import(
    "../platform/api/runtime/bootstrap-enterprise-api"
  );
  const runtime = getEnterpriseApiRuntime();
  const repository = runtime?.platform.durableStores?.brandBrain;
  if (repository) {
    // Repository is the actual source of truth; a fresh engine instance
    // hydrates from it lazily per organizationId, so this is safe even
    // though it isn't the exact same object as the integration engine's.
    return createBrandBrainPlatform({ repository }).engine;
  }
  if (!fallbackEngine) {
    fallbackEngine = createBrandBrainPlatform().engine;
  }
  return fallbackEngine;
}

function nonEmpty(...values: (string | undefined)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function splitVocabulary(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pure mapper — Mongo product Brand → BrandBrainDocument.
 * Exported for direct (synchronous, non-versioned) profile reads in
 * LiveBusinessContextStores so multi-brand orgs keep per-brand fidelity
 * (the BrandBrainEngine itself only version-tracks one document per
 * organizationId).
 */
export function mapBrandDtoToBrandBrainDocument(
  brand: BrandDto
): BrandBrainDocument {
  const gp = brand.guidelinesProfile ?? {};
  const brandId = brand.id;
  const mission = nonEmpty(gp.mission as string | undefined);
  const vision = nonEmpty(gp.vision as string | undefined);
  const positioning = nonEmpty(brand.positioning);
  const description = nonEmpty(
    gp.description as string | undefined,
    brand.guidelines
  );
  const toneAdjectives = splitVocabulary(
    nonEmpty(gp.tone as string | undefined, brand.voice)
  );
  const competitors = Array.isArray(gp.competitors)
    ? (gp.competitors as string[])
    : [];
  const preferredVocabulary = Array.isArray(gp.preferredVocabulary)
    ? (gp.preferredVocabulary as string[])
    : [];
  const wordsToAvoid = Array.isArray(gp.wordsToAvoid)
    ? (gp.wordsToAvoid as string[])
    : [];
  const primaryColors = Array.isArray(gp.primaryColors)
    ? (gp.primaryColors as string[])
    : brand.colors ?? [];
  const secondaryColors = Array.isArray(gp.secondaryColors)
    ? (gp.secondaryColors as string[])
    : [];

  const doc: BrandBrainDocument = {
    organizationId: brand.organizationId,
    brandId,
    organization: {
      legalName: brand.name,
      industry: brand.industry ?? "",
      regions: [],
      languages: ["en"],
      summary: nonEmpty(description, positioning),
    },
    identity: {
      brandId,
      name: brand.name,
      mission,
      vision,
      values: preferredVocabulary,
      positioning,
      differentiators: [],
    },
    products: [],
    services: [],
    audiences: brand.targetAudience
      ? [
          {
            audienceId: `aud_${brandId}_1`,
            name: nonEmpty(
              gp.targetAudience as string | undefined,
              brand.targetAudience
            ),
            segments: [],
            pains: [],
            desires: [],
            channels: [],
          },
        ]
      : [],
    personas: [],
    competitors: competitors.map((name, idx) => ({
      competitorId: `comp_${brandId}_${idx + 1}`,
      name,
      strengths: [],
      weaknesses: [],
      positioningNotes: "",
    })),
    tone: {
      adjectives: toneAdjectives,
      doList: nonEmpty(gp.writingStyle as string | undefined)
        ? [nonEmpty(gp.writingStyle as string | undefined)]
        : [],
      dontList: wordsToAvoid,
      samplePhrases: [],
    },
    visual: {
      colorPalette: [...primaryColors, ...secondaryColors],
      typography: nonEmpty(gp.typography as string | undefined)
        ? [nonEmpty(gp.typography as string | undefined)]
        : [],
      imageryNotes: [
        gp.photographyStyle,
        gp.illustrationStyle,
        gp.iconStyle,
      ]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim()),
      logoUsage: nonEmpty(gp.logoRules as string | undefined)
        ? [nonEmpty(gp.logoRules as string | undefined)]
        : [],
    },
    campaignHistory: [],
    successfulStrategies: [],
    failedStrategies: [],
    contentPreferences: {
      preferredFormats: [],
      prohibitedTopics: wordsToAvoid,
      ctaStyles: nonEmpty(gp.ctaStyle as string | undefined)
        ? [nonEmpty(gp.ctaStyle as string | undefined)]
        : [],
    },
    policies: [
      gp.approvalRules
        ? {
            policyId: `pol_${brandId}_approval`,
            kind: "approval" as const,
            title: "Approval rules",
            rules: [String(gp.approvalRules)],
          }
        : undefined,
      gp.complianceNotes
        ? {
            policyId: `pol_${brandId}_compliance`,
            kind: "compliance" as const,
            title: "Compliance notes",
            rules: [String(gp.complianceNotes)],
          }
        : undefined,
      gp.legalNotes
        ? {
            policyId: `pol_${brandId}_legal`,
            kind: "compliance" as const,
            title: "Legal notes",
            rules: [String(gp.legalNotes)],
          }
        : undefined,
    ].filter((p): p is NonNullable<typeof p> => Boolean(p)),
    localization: gp.localizationRules
      ? [
          {
            region: "global",
            language: "en",
            culturalNotes: [String(gp.localizationRules)],
            restrictedTopics: [],
          },
        ]
      : [],
    seasonality: [],
    goals: [],
    styleGuideNotes: [
      gp.formattingRules,
      gp.emojiPolicy,
      gp.spacingRules,
      gp.aiRules,
      gp.voiceGuidelines,
      gp.brandStory,
      gp.brandPersonality,
      gp.socialStyle,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim()),
    marketNotes: [],
    assetRefs: brand.logoAssetId ? [brand.logoAssetId] : [],
  };
  return doc;
}

/**
 * Persist the mapped BrandBrainDocument as the current version for the
 * brand's organization. Best-effort: callers should not fail brand
 * create/update if the engine/repository is temporarily unavailable.
 */
export async function syncProductBrandToBrain(
  brand: BrandDto,
  engine?: IBrandBrainEngine
): Promise<void> {
  const resolvedEngine = engine ?? (await resolveBrandBrainEngine());
  const document = mapBrandDtoToBrandBrainDocument(brand);
  const result = await resolvedEngine.upsert({
    organizationId: brand.organizationId,
    document,
    changelog: `product brand '${brand.name}' synced (${brand.id})`,
    label: `product-brand-${brand.id}`,
  });
  if (!result.ok) {
    throw new Error(
      `Brand Brain sync failed for brand ${brand.id}: ${result.error.message}`
    );
  }
}
