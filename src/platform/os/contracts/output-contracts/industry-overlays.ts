/**
 * Industry overlay extension mechanism.
 * Overlays modify effective contracts without replacing canonical service contracts.
 * Populated scaffold — Learning/Research Plane can evolve these.
 */

import type { ContractRequirement, QualityDimension } from "./evaluation-methods";
import { OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION } from "./versioning";

export type IndustryOverlay = {
  readonly overlayId: string;
  readonly version: string;
  readonly industry: string;
  readonly label: string;
  readonly hardRequirements: readonly ContractRequirement[];
  readonly qualityDimensions: readonly QualityDimension[];
  readonly description: string;
};

function overlayReq(
  overlayId: string,
  suffix: string,
  category: ContractRequirement["category"],
  description: string,
): ContractRequirement {
  return {
    id: `industry.${overlayId}.${suffix}`,
    class: "hard",
    category,
    description,
    evaluation: {
      method: "semantic_evaluator",
      expectedResult: description,
      severity: "medium",
      blocksCompletion: false,
    },
    optional: true,
  };
}

function overlayQuality(
  overlayId: string,
  suffix: string,
  label: string,
  definition: string,
  threshold: number,
): QualityDimension {
  return {
    id: `industry.${overlayId}.${suffix}`,
    label,
    definition,
    scoringRange: { min: 0, max: 100 },
    evaluationMethod: "semantic_evaluator",
    threshold,
    weight: 1.1,
  };
}

/** Known industry overlays — extensible without duplicating service contracts. */
export const INDUSTRY_OVERLAYS: Readonly<Record<string, IndustryOverlay>> =
  Object.freeze({
    healthcare: {
      overlayId: "healthcare",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "healthcare",
      label: "Healthcare",
      description: "Healthcare trust, accessibility, and information clarity emphasis",
      hardRequirements: Object.freeze([
        overlayReq("healthcare", "trust", "content", "Trust signals and professional tone"),
        overlayReq("healthcare", "accessibility", "accessibility", "Enhanced accessibility for diverse users"),
        overlayReq("healthcare", "claims", "content", "No unsubstantiated medical claims"),
      ]),
      qualityDimensions: Object.freeze([
        overlayQuality("healthcare", "trust", "Healthcare trust", "Professional, trustworthy presentation", 80),
        overlayQuality("healthcare", "clarity", "Information clarity", "Clear, accessible health information", 80),
      ]),
    },
    fashion: {
      overlayId: "fashion",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "fashion",
      label: "Fashion & Apparel",
      description: "Visual storytelling, product presentation, brand expression",
      hardRequirements: Object.freeze([]),
      qualityDimensions: Object.freeze([
        overlayQuality("fashion", "storytelling", "Visual storytelling", "Compelling fashion narrative", 75),
        overlayQuality("fashion", "product_presentation", "Product presentation", "Product shown attractively", 80),
        overlayQuality("fashion", "brand_expression", "Brand expression", "Strong brand aesthetic", 75),
      ]),
    },
    ecommerce: {
      overlayId: "ecommerce",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "ecommerce",
      label: "E-commerce & Retail",
      description: "Conversion, product clarity, and shopping UX",
      hardRequirements: Object.freeze([
        overlayReq("ecommerce", "product_clarity", "content", "Products clearly presented with key details"),
      ]),
      qualityDimensions: Object.freeze([
        overlayQuality("ecommerce", "conversion", "Conversion UX", "Supports purchase decisions", 75),
        overlayQuality("ecommerce", "product_clarity", "Product clarity", "Clear product information", 80),
      ]),
    },
    finance: {
      overlayId: "finance",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "finance",
      label: "Finance & Banking",
      description: "Trust, compliance tone, and clarity",
      hardRequirements: Object.freeze([
        overlayReq("finance", "compliance_tone", "content", "Appropriate compliance-aware messaging"),
      ]),
      qualityDimensions: Object.freeze([
        overlayQuality("finance", "trust", "Financial trust", "Professional, trustworthy tone", 80),
      ]),
    },
    technology: {
      overlayId: "technology",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "technology",
      label: "Technology & SaaS",
      description: "Product clarity, modern UX, and technical credibility",
      qualityDimensions: Object.freeze([
        overlayQuality("technology", "product_clarity", "Product clarity", "Product value clearly communicated", 75),
        overlayQuality("technology", "modern_ux", "Modern UX", "Contemporary tech UX patterns", 70),
      ]),
      hardRequirements: Object.freeze([]),
    },
    food_beverage: {
      overlayId: "food_beverage",
      version: OUTPUT_CONTRACT_INDUSTRY_OVERLAY_VERSION,
      industry: "food_beverage",
      label: "Food & Beverage",
      description: "Appetite appeal and product freshness",
      qualityDimensions: Object.freeze([
        overlayQuality("food_beverage", "appetite_appeal", "Appetite appeal", "Visually appetizing presentation", 75),
      ]),
      hardRequirements: Object.freeze([]),
    },
  });

/** Normalize industry string from brand profile to overlay key. */
export function normalizeIndustryKey(industry?: string): string | undefined {
  if (!industry?.trim()) return undefined;
  const normalized = industry
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (INDUSTRY_OVERLAYS[normalized]) return normalized;
  // Fuzzy match common aliases
  const aliases: Record<string, string> = {
    health: "healthcare",
    medical: "healthcare",
    pharma: "healthcare",
    apparel: "fashion",
    retail: "ecommerce",
    shopping: "ecommerce",
    fintech: "finance",
    banking: "finance",
    saas: "technology",
    software: "technology",
    food: "food_beverage",
    restaurant: "food_beverage",
  };
  for (const [alias, key] of Object.entries(aliases)) {
    if (normalized.includes(alias)) return key;
  }
  return undefined;
}

export function resolveIndustryOverlay(industry?: string): IndustryOverlay | undefined {
  const key = normalizeIndustryKey(industry);
  if (!key) return undefined;
  return INDUSTRY_OVERLAYS[key];
}
