/**
 * Evidence ranking for graph-derived context facts.
 */

import type { KnowledgeConfidenceBand } from "../contracts";
import type { KnowledgeContextFact } from "../contracts";

export function confidenceBand(confidence: number): KnowledgeConfidenceBand {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

export function rankFacts(
  facts: readonly KnowledgeContextFact[],
  maxFacts: number
): KnowledgeContextFact[] {
  return [...facts]
    .sort((a, b) => b.score * b.confidence - a.score * a.confidence)
    .slice(0, maxFacts);
}

export function scoreEntityMatch(
  tags: readonly string[] | undefined,
  queryHints: readonly string[]
): number {
  if (!queryHints.length) return 0.5;
  const tagSet = new Set((tags ?? []).map((t) => t.toLowerCase()));
  let hits = 0;
  for (const h of queryHints) {
    if (tagSet.has(h.toLowerCase())) hits += 1;
  }
  return Math.min(1, 0.4 + hits * 0.2);
}
