/**
 * Seed taxonomy — business capabilities, not provider names.
 */

import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type {
  CapabilityCategory,
  CapabilityDepartment,
  CapabilityMaturity,
  ComplexityTier,
  CostTier,
  LatencyTier,
} from "../contracts/enums";

function def(
  partial: Omit<
    CapabilityDefinitionRecord,
    | "lifecycle"
    | "inputs"
    | "outputs"
    | "dependencies"
    | "requiredArtifacts"
    | "supportedProviders"
    | "supportedModels"
    | "requiredEvaluators"
    | "requiredGovernance"
    | "requiredKnowledge"
    | "requiredContext"
    | "requiredExperience"
    | "qualityExpectations"
    | "industryTags"
    | "keywords"
    | "version"
  > &
    Partial<CapabilityDefinitionRecord>
): CapabilityDefinitionRecord {
  return {
    version: "1.0.0",
    lifecycle: "active",
    inputs: [{ name: "brief", contentTypes: ["text"], required: true }],
    outputs: [{ name: "artifact", contentTypes: ["text", "structured"], required: true }],
    dependencies: [],
    requiredArtifacts: [],
    supportedProviders: [],
    supportedModels: [],
    requiredEvaluators: ["quality"],
    requiredGovernance: ["standard"],
    requiredKnowledge: [],
    requiredContext: ["business_objective"],
    requiredExperience: [],
    qualityExpectations: {
      minQuality: 0.7,
      minReliability: 0.8,
      requireHumanReview: false,
    },
    industryTags: [],
    keywords: [],
    ...partial,
  };
}

const marketing: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "marketing.social.carousel",
    name: "Social Carousel",
    category: "generation",
    department: "marketing",
    description: "Generate multi-slide social carousel content.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "moderate",
    maturity: "stable",
    keywords: ["social", "carousel", "instagram", "linkedin"],
    industryTags: ["consumer", "saas"],
    dependencies: ["marketing.copywriting"],
    requiredArtifacts: ["brand_guidelines"],
  }),
  def({
    capabilityId: "marketing.copywriting",
    name: "Marketing Copywriting",
    category: "generation",
    department: "marketing",
    description: "Produce marketing copy for campaigns and landing pages.",
    costTier: "low",
    latencyTier: "fast",
    complexity: "simple",
    maturity: "enterprise",
    keywords: ["copy", "headline", "cta", "messaging"],
  }),
  def({
    capabilityId: "marketing.email",
    name: "Marketing Email",
    category: "generation",
    department: "marketing",
    description: "Compose email campaigns and sequences.",
    costTier: "low",
    latencyTier: "fast",
    complexity: "simple",
    maturity: "stable",
    keywords: ["email", "newsletter", "drip"],
    dependencies: ["marketing.copywriting"],
  }),
];

const design: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "design.image_generation",
    name: "Image Generation",
    category: "generation",
    department: "design",
    description: "Generate images from briefs and brand constraints.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "moderate",
    maturity: "stable",
    keywords: ["image", "visual", "illustration"],
    outputs: [{ name: "image", contentTypes: ["image"], required: true }],
  }),
  def({
    capabilityId: "design.logo_creation",
    name: "Logo Creation",
    category: "generation",
    department: "design",
    description: "Create logo concepts and variants.",
    costTier: "high",
    latencyTier: "batch",
    complexity: "complex",
    maturity: "preview",
    keywords: ["logo", "brand", "identity"],
    dependencies: ["design.image_generation"],
    qualityExpectations: {
      minQuality: 0.8,
      minReliability: 0.75,
      requireHumanReview: true,
    },
  }),
];

const video: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "video.short_form_generation",
    name: "Short-Form Video",
    category: "generation",
    department: "video",
    description: "Generate short-form video creative plans and scripts.",
    costTier: "high",
    latencyTier: "batch",
    complexity: "complex",
    maturity: "preview",
    keywords: ["tiktok", "reels", "shorts", "video"],
    dependencies: ["marketing.copywriting"],
  }),
  def({
    capabilityId: "video.avatar_generation",
    name: "Avatar Video",
    category: "generation",
    department: "video",
    description: "Generate avatar-based video content plans.",
    costTier: "premium",
    latencyTier: "batch",
    complexity: "expert",
    maturity: "experimental",
    keywords: ["avatar", "presenter", "talking-head"],
  }),
];

const software: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "software.code_generation",
    name: "Code Generation",
    category: "generation",
    department: "software",
    description: "Generate application code from specifications.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "complex",
    maturity: "stable",
    keywords: ["code", "implement", "scaffold"],
  }),
  def({
    capabilityId: "software.code_review",
    name: "Code Review",
    category: "review",
    department: "software",
    description: "Review code for defects, security, and style.",
    costTier: "low",
    latencyTier: "fast",
    complexity: "moderate",
    maturity: "enterprise",
    keywords: ["review", "lint", "security"],
    dependencies: ["software.code_generation"],
  }),
  def({
    capabilityId: "software.refactoring",
    name: "Refactoring",
    category: "transformation",
    department: "software",
    description: "Refactor code for maintainability and performance.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "complex",
    maturity: "stable",
    keywords: ["refactor", "cleanup", "rewrite"],
    dependencies: ["software.code_review"],
  }),
];

const research: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "research.market_analysis",
    name: "Market Analysis",
    category: "analysis",
    department: "research",
    description: "Analyze markets, competitors, and trends.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "complex",
    maturity: "stable",
    keywords: ["market", "competitor", "research", "tam"],
    requiredKnowledge: ["market_docs"],
  }),
];

const business: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "business.strategy",
    name: "Business Strategy",
    category: "planning",
    department: "business",
    description: "Formulate business strategy recommendations.",
    costTier: "high",
    latencyTier: "batch",
    complexity: "expert",
    maturity: "stable",
    keywords: ["strategy", "roadmap", "okrs"],
    dependencies: ["research.market_analysis"],
    qualityExpectations: {
      minQuality: 0.85,
      minReliability: 0.8,
      requireHumanReview: true,
    },
  }),
];

const legal: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "legal.contract_review",
    name: "Contract Review",
    category: "review",
    department: "legal",
    description: "Review contracts for risk and obligations.",
    costTier: "high",
    latencyTier: "standard",
    complexity: "expert",
    maturity: "enterprise",
    keywords: ["contract", "legal", "clause"],
    requiredGovernance: ["legal_review", "compliance"],
    qualityExpectations: {
      minQuality: 0.9,
      minReliability: 0.9,
      requireHumanReview: true,
    },
  }),
];

const finance: CapabilityDefinitionRecord[] = [
  def({
    capabilityId: "finance.forecasting",
    name: "Financial Forecasting",
    category: "analysis",
    department: "finance",
    description: "Forecast financial metrics and scenarios.",
    costTier: "medium",
    latencyTier: "standard",
    complexity: "complex",
    maturity: "stable",
    keywords: ["forecast", "budget", "revenue", "finance"],
    requiredKnowledge: ["financials"],
  }),
];

export const CAPABILITY_TAXONOMY_SEED: readonly CapabilityDefinitionRecord[] = [
  ...marketing,
  ...design,
  ...video,
  ...software,
  ...research,
  ...business,
  ...legal,
  ...finance,
];

export function taxonomyByDepartment(
  department: CapabilityDepartment
): readonly CapabilityDefinitionRecord[] {
  return CAPABILITY_TAXONOMY_SEED.filter((c) => c.department === department);
}

export function taxonomyByMaturity(
  maturity: CapabilityMaturity
): readonly CapabilityDefinitionRecord[] {
  return CAPABILITY_TAXONOMY_SEED.filter((c) => c.maturity === maturity);
}

export type { CapabilityCategory, CostTier, LatencyTier, ComplexityTier };
