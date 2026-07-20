/**
 * Semantic similarity placeholder — never calls AI.
 */

import type { ISemanticSimilarityEngine } from "../interfaces/experience-injection";

/**
 * Deterministic placeholder: Jaccard token overlap on whitespace-split strings.
 * Reserved for future embedding-based semantic similarity.
 */
export class PlaceholderSemanticSimilarityEngine implements ISemanticSimilarityEngine {
  score(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection += 1;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
