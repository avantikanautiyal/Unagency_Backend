/**
 * Scoring engine — heuristic placeholder.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationScore } from "../contracts/scoring";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { OptimizationDomain } from "../contracts/enums";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IScoringEngine } from "../interfaces/execution-optimization";

const DOMAIN_WEIGHTS: Record<OptimizationDomain, number> = {
  execution_strategy: 0.15,
  provider_selection: 0.12,
  reasoning_mode: 0.1,
  prompt_structure: 0.1,
  knowledge_ranking: 0.08,
  context_size: 0.07,
  compression: 0.07,
  token_budget: 0.1,
  verification_strategy: 0.1,
  retry_strategy: 0.05,
  streaming_preference: 0.03,
  cost_vs_quality: 0.06,
  latency_vs_quality: 0.07,
};

export class DefaultScoringEngine implements IScoringEngine {
  score(
    _request: ExecutionOptimizationRequest,
    recommendations: readonly OptimizationRecommendation[]
  ): Result<readonly OptimizationScore[]> {
    const byDomain = new Map<OptimizationDomain, OptimizationRecommendation[]>();
    for (const rec of recommendations) {
      const list = byDomain.get(rec.domain) ?? [];
      list.push(rec);
      byDomain.set(rec.domain, list);
    }

    const scores: OptimizationScore[] = [];
    for (const [domain, recs] of byDomain) {
      const baseline = 0.5;
      const improvement = recs.reduce((s, r) => s + r.expectedImpact, 0) / recs.length;
      scores.push({
        domain,
        score: Math.min(1, baseline + improvement),
        baseline,
        improvement,
        weight: DOMAIN_WEIGHTS[domain] ?? 0.05,
      });
    }

    return success(scores);
  }
}
