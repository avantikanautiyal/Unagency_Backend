/**
 * Brand Brain knowledge models — structured organizational intelligence.
 */

import type { BrandBrainSection } from "./enums";

export interface OrganizationProfileKnowledge {
  readonly legalName: string;
  readonly industry: string;
  readonly sizeBand?: string;
  readonly regions: readonly string[];
  readonly languages: readonly string[];
  readonly summary: string;
}

export interface BrandIdentityKnowledge {
  readonly brandId: string;
  readonly name: string;
  readonly mission: string;
  readonly vision: string;
  readonly values: readonly string[];
  readonly positioning: string;
  readonly differentiators: readonly string[];
}

export interface ProductKnowledge {
  readonly productId: string;
  readonly name: string;
  readonly category: string;
  readonly benefits: readonly string[];
  readonly proofPoints: readonly string[];
}

export interface ServiceKnowledge {
  readonly serviceId: string;
  readonly name: string;
  readonly description: string;
  readonly outcomes: readonly string[];
}

export interface AudienceKnowledge {
  readonly audienceId: string;
  readonly name: string;
  readonly segments: readonly string[];
  readonly pains: readonly string[];
  readonly desires: readonly string[];
  readonly channels: readonly string[];
}

export interface PersonaKnowledge {
  readonly personaId: string;
  readonly name: string;
  readonly role: string;
  readonly goals: readonly string[];
  readonly objections: readonly string[];
}

export interface CompetitorKnowledge {
  readonly competitorId: string;
  readonly name: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly positioningNotes: string;
}

export interface ToneKnowledge {
  readonly adjectives: readonly string[];
  readonly doList: readonly string[];
  readonly dontList: readonly string[];
  readonly samplePhrases: readonly string[];
}

export interface VisualGuidelinesKnowledge {
  readonly colorPalette: readonly string[];
  readonly typography: readonly string[];
  readonly imageryNotes: readonly string[];
  readonly logoUsage: readonly string[];
}

export interface CampaignHistoryEntry {
  readonly campaignId: string;
  readonly name: string;
  readonly objective: string;
  readonly outcome: "success" | "mixed" | "failed";
  readonly lessons: readonly string[];
  readonly channels: readonly string[];
}

export interface StrategyMemory {
  readonly strategyId: string;
  readonly title: string;
  readonly summary: string;
  readonly succeeded: boolean;
  readonly tags: readonly string[];
}

export interface PolicyKnowledge {
  readonly policyId: string;
  readonly kind: "compliance" | "marketing" | "approval" | "content";
  readonly title: string;
  readonly rules: readonly string[];
}

export interface LocalizationKnowledge {
  readonly region: string;
  readonly language: string;
  readonly culturalNotes: readonly string[];
  readonly restrictedTopics: readonly string[];
}

export interface SeasonalityKnowledge {
  readonly seasonId: string;
  readonly name: string;
  readonly months: readonly number[];
  readonly themes: readonly string[];
  readonly offers: readonly string[];
}

export interface BusinessGoalKnowledge {
  readonly goalId: string;
  readonly title: string;
  readonly kpi: string;
  readonly priority: "p0" | "p1" | "p2";
  readonly department?: string;
}

export interface ContentPreferencesKnowledge {
  readonly preferredFormats: readonly string[];
  readonly prohibitedTopics: readonly string[];
  readonly ctaStyles: readonly string[];
}

/** Full structured Brand Brain document (one version snapshot). */
export interface BrandBrainDocument {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly organization: OrganizationProfileKnowledge;
  readonly identity: BrandIdentityKnowledge;
  readonly products: readonly ProductKnowledge[];
  readonly services: readonly ServiceKnowledge[];
  readonly audiences: readonly AudienceKnowledge[];
  readonly personas: readonly PersonaKnowledge[];
  readonly competitors: readonly CompetitorKnowledge[];
  readonly tone: ToneKnowledge;
  readonly visual: VisualGuidelinesKnowledge;
  readonly campaignHistory: readonly CampaignHistoryEntry[];
  readonly successfulStrategies: readonly StrategyMemory[];
  readonly failedStrategies: readonly StrategyMemory[];
  readonly contentPreferences: ContentPreferencesKnowledge;
  readonly policies: readonly PolicyKnowledge[];
  readonly localization: readonly LocalizationKnowledge[];
  readonly seasonality: readonly SeasonalityKnowledge[];
  readonly goals: readonly BusinessGoalKnowledge[];
  readonly styleGuideNotes: readonly string[];
  readonly marketNotes: readonly string[];
  readonly assetRefs: readonly string[];
}

export interface BrandBrainVersionRecord {
  readonly versionId: string;
  readonly organizationId: string;
  readonly version: number;
  readonly label?: string;
  readonly document: BrandBrainDocument;
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly changelog: string;
}

export type { BrandBrainSection };
