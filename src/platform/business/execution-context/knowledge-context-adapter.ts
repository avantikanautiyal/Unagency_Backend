/**
 * Adapts Business Knowledge Intelligence output to Intelligence KnowledgeSnapshot.
 */

import type { KnowledgeContextPackage } from "../knowledge-intelligence/contracts";
import type { BrandBrainEnrichmentPackage } from "../brand-brain/contracts";
import type {
  KnowledgeDocument,
  KnowledgeSnapshot,
  KnowledgeSource,
} from "../../intelligence/knowledge/contracts/knowledge-models";

export function mergeBusinessKnowledgeIntoSnapshot(input: {
  base: KnowledgeSnapshot;
  businessKnowledge?: KnowledgeContextPackage;
  brandEnrichment?: BrandBrainEnrichmentPackage;
  nowIso: () => string;
}): KnowledgeSnapshot {
  const extraDocs: KnowledgeDocument[] = [];
  const extraSources: KnowledgeSource[] = [];

  if (input.businessKnowledge) {
    extraSources.push({
      id: `biz_ki_${input.businessKnowledge.contextId}`,
      kind: "inline",
      name: "business_knowledge_intelligence",
      available: true,
      attributes: {
        graphVersion: input.businessKnowledge.graphVersion,
        snapshotId: input.businessKnowledge.snapshotId,
        brandBrainVersion: input.businessKnowledge.brandBrainVersion,
      },
    });

    for (const fact of input.businessKnowledge.facts.slice(0, 20)) {
      extraDocs.push({
        id: fact.factId,
        sourceId: `biz_ki_${input.businessKnowledge.contextId}`,
        content: JSON.stringify({
          kind: fact.kind,
          entityId: fact.entityId,
          key: fact.key,
          value: fact.value,
        }),
        chunks: [
          {
            id: `${fact.factId}_0`,
            documentId: fact.factId,
            content: `${fact.key}: ${summarizeValue(fact.value)}`,
            ordinal: 0,
            score: { relevance: fact.score, final: fact.score },
          },
        ],
        metadata: {
          title: fact.key,
          tags: [fact.kind],
          attributes: { provenance: "business_knowledge_intelligence" },
        },
        score: { relevance: fact.score, final: fact.score },
      });
    }
  }

  if (input.brandEnrichment) {
    extraSources.push({
      id: `brand_brain_${input.brandEnrichment.enrichmentId}`,
      kind: "brand_guideline",
      name: "brand_brain_enrichment",
      available: true,
      attributes: {
        brainVersion: input.brandEnrichment.brainVersion,
        brandId: input.brandEnrichment.brandId,
      },
    });

    for (const fact of input.brandEnrichment.facts.slice(0, 15)) {
      extraDocs.push({
        id: `bb_${fact.factId}`,
        sourceId: `brand_brain_${input.brandEnrichment.enrichmentId}`,
        content: JSON.stringify({
          section: fact.section,
          key: fact.key,
          value: fact.value,
        }),
        chunks: [
          {
            id: `bb_${fact.factId}_0`,
            documentId: `bb_${fact.factId}`,
            content: `${fact.section}.${fact.key}: ${summarizeValue(fact.value)}`,
            ordinal: 0,
            score: {
              relevance: fact.confidence,
              brandAlignment: 1,
              final: fact.confidence,
            },
          },
        ],
        metadata: {
          title: `${fact.section}.${fact.key}`,
          tags: [fact.section, "brand_brain"],
          attributes: { sourceRef: fact.sourceRef },
        },
        score: {
          relevance: fact.confidence,
          brandAlignment: 1,
          final: fact.confidence,
        },
      });
    }
  }

  if (extraDocs.length === 0) {
    return input.base;
  }

  return {
    ...input.base,
    documents: [...input.base.documents, ...extraDocs],
    sources: [...input.base.sources, ...extraSources],
    metadata: {
      ...input.base.metadata,
      attributes: {
        ...(input.base.metadata?.attributes ?? {}),
        businessKnowledgeContextId: input.businessKnowledge?.contextId,
        brandEnrichmentId: input.brandEnrichment?.enrichmentId,
        mergedAt: input.nowIso(),
      },
    },
  };
}

function summarizeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    const name = (value as { name?: string }).name;
    if (name) return name;
    return JSON.stringify(value).slice(0, 200);
  }
  return String(value ?? "");
}
