/**
 * Provider learner — advisory preference hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IProviderLearner } from "../interfaces/execution-optimization";
import { avgMetric, makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultProviderLearner implements IProviderLearner {
  learn(
    request: ExecutionOptimizationRequest,
    _patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const reports = request.inputs.observabilityReports ?? [];
    if (reports.length === 0) return success([]);

    const byProvider = new Map<string, { quality: number[]; latency: number[] }>();
    for (const r of reports) {
      const entry = byProvider.get(r.providerId) ?? { quality: [], latency: [] };
      entry.quality.push(r.qualityScore);
      entry.latency.push(r.latencyMs);
      byProvider.set(r.providerId, entry);
    }

    const recs: OptimizationRecommendation[] = [];
    for (const [providerId, metrics] of byProvider) {
      const quality = avgMetric(metrics.quality);
      const latency = avgMetric(metrics.latency);
      if (quality > 0.8 && latency < 1500) {
        recs.push(
          makeRecommendation(
            `rec_provider_${providerId}`,
            "provider_selection",
            `Prefer provider ${providerId}`,
            `Provider ${providerId} shows quality ${quality.toFixed(2)} and latency ${latency.toFixed(0)}ms`,
            "Historical observability favors this provider for future routing hints",
            0.12,
            0.7,
            now
          )
        );
      }
    }

    return success(recs);
  }
}
