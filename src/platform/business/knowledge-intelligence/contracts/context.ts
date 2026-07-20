/**
 * Retrieval, context assembly, evidence, explainability contracts.
 */

import type { KnowledgeConfidenceBand, KnowledgeEvidenceKind } from "./enums";
import type { KnowledgeEntityType, KnowledgeRelationshipType } from "./enums";
import type { KnowledgePath } from "./graph";

export interface KnowledgeRetrievalQuery {
  readonly organizationId: string;
  readonly seedEntityIds?: readonly string[];
  readonly seedTypes?: readonly KnowledgeEntityType[];
  readonly capabilityId?: string;
  readonly campaignId?: string;
  readonly productId?: string;
  readonly audienceId?: string;
  readonly region?: string;
  readonly market?: string;
  readonly department?: string;
  readonly maxDepth?: number;
  readonly maxFacts?: number;
  readonly preferRelationshipTypes?: readonly KnowledgeRelationshipType[];
}

/** Structured fact from graph — never prompts, never raw documents. */
export interface KnowledgeContextFact {
  readonly factId: string;
  readonly kind: KnowledgeEvidenceKind;
  readonly entityId?: string;
  readonly relationshipId?: string;
  readonly path?: KnowledgePath;
  readonly key: string;
  readonly value: string | readonly string[] | Readonly<Record<string, unknown>>;
  readonly score: number;
  readonly confidence: number;
  readonly confidenceBand: KnowledgeConfidenceBand;
  readonly sourceRefs: readonly string[];
}

export interface KnowledgeExplainabilityItem {
  readonly factId: string;
  readonly whySelected: string;
  readonly traversalSummary: string;
  readonly score: number;
  readonly confidence: number;
  readonly relationshipTypesUsed: readonly KnowledgeRelationshipType[];
}

export interface KnowledgeContextPackage {
  readonly contextId: string;
  readonly organizationId: string;
  readonly graphVersion: number;
  readonly snapshotId: string;
  readonly brandBrainVersion?: number;
  readonly retrievedAt: string;
  readonly query: KnowledgeRetrievalQuery;
  readonly facts: readonly KnowledgeContextFact[];
  readonly relatedEntityIds: readonly string[];
  readonly explainability: readonly KnowledgeExplainabilityItem[];
  readonly summary: {
    readonly factCount: number;
    readonly entityCount: number;
    readonly relationshipEvidenceCount: number;
    readonly averageConfidence: number;
    readonly averageScore: number;
  };
}
