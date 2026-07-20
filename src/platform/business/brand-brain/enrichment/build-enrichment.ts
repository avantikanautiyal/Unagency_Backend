/**
 * Build structured enrichment package — never prompts, never raw documents.
 */

import type {
  BrandBrainEnrichmentPackage,
  BrandBrainRetrievalQuery,
  BrandBrainSection,
  BrandBrainVersionRecord,
  StructuredContextFact,
  BrandBrainExplainabilityItem,
} from "../contracts";
import { retrieveCandidates } from "../retrieval/retrieve";

export function buildEnrichmentPackage(
  version: BrandBrainVersionRecord,
  query: BrandBrainRetrievalQuery,
  enrichmentId: string,
  nowIso: () => string,
  createFactId: (prefix: string) => string
): BrandBrainEnrichmentPackage {
  const candidates = retrieveCandidates(version.document, query);
  const facts: StructuredContextFact[] = [];
  const explainability: BrandBrainExplainabilityItem[] = [];

  for (const c of candidates) {
    const factId = createFactId("bbf");
    facts.push({
      factId,
      section: c.section,
      key: c.key,
      value: c.value,
      relevance: c.relevance,
      confidence: c.confidence,
      sourceRef: c.sourceRef,
    });
    explainability.push({
      factId,
      section: c.section,
      whySelected: c.whySelected,
      confidence: c.confidence,
      relevance: c.relevance,
      score: c.score,
    });
  }

  const sectionsUsed = [...new Set(facts.map((f) => f.section))] as BrandBrainSection[];
  const averageConfidence =
    facts.length === 0
      ? 0
      : Number(
          (
            facts.reduce((s, f) => s + f.confidence, 0) / facts.length
          ).toFixed(4)
        );

  return {
    enrichmentId,
    organizationId: query.organizationId,
    brandId: query.brandId ?? version.document.brandId ?? version.document.identity.brandId,
    brainVersion: version.version,
    versionId: version.versionId,
    retrievedAt: nowIso(),
    query,
    facts,
    explainability,
    summary: {
      factCount: facts.length,
      sectionsUsed,
      averageConfidence,
    },
  };
}

export function enrichmentToExecutionMetadata(
  enrichment: BrandBrainEnrichmentPackage
): Readonly<Record<string, unknown>> {
  return {
    brandBrain: {
      enrichmentId: enrichment.enrichmentId,
      organizationId: enrichment.organizationId,
      brandId: enrichment.brandId,
      brainVersion: enrichment.brainVersion,
      versionId: enrichment.versionId,
      facts: enrichment.facts,
      explainability: enrichment.explainability,
      summary: enrichment.summary,
      // Explicit guarantees for downstream consumers
      containsRawDocuments: false,
      containsGeneratedPrompts: false,
      proprietary: true,
    },
  };
}
