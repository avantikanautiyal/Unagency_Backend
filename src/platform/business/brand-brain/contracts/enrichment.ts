/**
 * Retrieval, enrichment, explainability contracts.
 */

import type { BrandBrainSection, EnrichmentRelevance } from "./enums";

export interface BrandBrainRetrievalQuery {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly capabilityId?: string;
  readonly department?: string;
  readonly campaignId?: string;
  readonly audienceId?: string;
  readonly market?: string;
  readonly productId?: string;
  readonly region?: string;
  readonly includeHistoricalPerformance?: boolean;
  readonly includeObjectives?: boolean;
  /** Prefer these sections when scoring. */
  readonly preferSections?: readonly BrandBrainSection[];
}

/** Structured fact — never raw documents, never rendered prompts. */
export interface StructuredContextFact {
  readonly factId: string;
  readonly section: BrandBrainSection;
  readonly key: string;
  readonly value: string | readonly string[] | Readonly<Record<string, unknown>>;
  readonly relevance: EnrichmentRelevance;
  readonly confidence: number;
  readonly sourceRef: string;
}

export interface BrandBrainExplainabilityItem {
  readonly factId: string;
  readonly section: BrandBrainSection;
  readonly whySelected: string;
  readonly confidence: number;
  readonly relevance: EnrichmentRelevance;
  readonly score: number;
}

export interface BrandBrainEnrichmentPackage {
  readonly enrichmentId: string;
  readonly organizationId: string;
  readonly brandId?: string;
  readonly brainVersion: number;
  readonly versionId: string;
  readonly retrievedAt: string;
  readonly query: BrandBrainRetrievalQuery;
  /** Structured context only — NO prompts, NO raw docs. */
  readonly facts: readonly StructuredContextFact[];
  readonly explainability: readonly BrandBrainExplainabilityItem[];
  readonly summary: {
    readonly factCount: number;
    readonly sectionsUsed: readonly BrandBrainSection[];
    readonly averageConfidence: number;
  };
}

export interface BrandBrainVersionDiff {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changedPaths: readonly string[];
  readonly addedPaths: readonly string[];
  readonly removedPaths: readonly string[];
}
