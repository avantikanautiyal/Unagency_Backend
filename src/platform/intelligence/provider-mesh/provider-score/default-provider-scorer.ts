/**
 * Composite provider scorer.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderScoreBreakdown, ProviderTelemetryWindow } from "../contracts/state";
import type { IProviderScorer } from "../interfaces/mesh";
import { SCORE_WEIGHTS } from "../constants";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Map latency to score — lower latency is better. */
function latencyScore(avgMs: number, p95Ms: number): number {
  const blended = avgMs * 0.6 + p95Ms * 0.4;
  if (blended <= 100) return 1;
  if (blended >= 2000) return 0;
  return clamp01(1 - (blended - 100) / 1900);
}

/** Lower cost is better; normalize soft. */
function costScore(cost: number): number {
  if (cost <= 0) return 1;
  if (cost >= 0.1) return 0.2;
  return clamp01(1 - cost / 0.1);
}

export class DefaultProviderScorer implements IProviderScorer {
  score(
    telemetry: ProviderTelemetryWindow,
    healthScore: number,
    certificationBoost: number
  ): Result<ProviderScoreBreakdown> {
    const availability = clamp01(telemetry.availability);
    const latency = latencyScore(telemetry.averageLatencyMs, telemetry.p95LatencyMs);
    const reliability = clamp01(
      (1 - telemetry.errorRate) * 0.5 +
        (1 - telemetry.retryRate) * 0.25 +
        (1 - telemetry.timeoutRate) * 0.25
    );
    const quality = clamp01(telemetry.averageQuality);
    const historicalSuccess = clamp01(telemetry.successRate);
    const cost = costScore(telemetry.averageCost);
    const certification = clamp01(certificationBoost);
    const currentLoad = clamp01(1 - telemetry.capacityUtilization);

    const overall = clamp01(
      availability * SCORE_WEIGHTS.availability +
        latency * SCORE_WEIGHTS.latency +
        reliability * SCORE_WEIGHTS.reliability +
        quality * SCORE_WEIGHTS.quality +
        historicalSuccess * SCORE_WEIGHTS.historicalSuccess +
        cost * SCORE_WEIGHTS.cost +
        certification * SCORE_WEIGHTS.certification +
        currentLoad * SCORE_WEIGHTS.currentLoad
    );

    // Blend health lightly into overall for operational coherence.
    const blended = clamp01(overall * 0.9 + healthScore * 0.1);

    return success({
      availability,
      latency,
      reliability,
      quality,
      historicalSuccess,
      cost,
      certification,
      currentLoad,
      overall: blended,
    });
  }
}
