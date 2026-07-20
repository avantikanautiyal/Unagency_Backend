/**
 * Routing hint builder — advisory only.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderOperationalRecord } from "../contracts/state";
import type { RoutingHint } from "../contracts/recommendations";
import type { IRoutingHintBuilder } from "../interfaces/mesh";
import type { HintTarget } from "../contracts/enums";

const TARGETS: readonly HintTarget[] = [
  "routing",
  "negotiation",
  "execution_intelligence",
  "model_intelligence",
  "consensus",
];

export class DefaultRoutingHintBuilder implements IRoutingHintBuilder {
  build(records: readonly ProviderOperationalRecord[]): Result<readonly RoutingHint[]> {
    const hints: RoutingHint[] = [];
    let i = 0;

    const ranked = [...records].sort(
      (a, b) => b.compositeScore.overall - a.compositeScore.overall
    );

    for (const record of ranked) {
      const prefer =
        record.state === "healthy" && record.compositeScore.overall >= 0.65;
      const avoid =
        record.state === "unavailable" ||
        record.state === "maintenance" ||
        record.state === "deprecated" ||
        record.compositeScore.overall < 0.35;
      const deprioritize =
        !avoid &&
        (record.state === "degraded" ||
          record.state === "rate_limited" ||
          record.state === "busy" ||
          record.state === "experimental");
      const limit = record.state === "busy" || record.state === "rate_limited";

      const action = avoid
        ? "avoid"
        : limit
          ? "limit"
          : deprioritize
            ? "deprioritize"
            : prefer
              ? "prefer"
              : "deprioritize";

      const priority =
        avoid || prefer ? "high" : deprioritize || limit ? "medium" : "low";

      for (const target of TARGETS) {
        hints.push({
          hintId: `hint_${++i}_${record.providerId}_${target}`,
          target,
          providerId: record.providerId,
          action,
          priority,
          rationale: {
            why: `${action} ${record.providerId} for ${target} because state=${record.state} and composite=${record.compositeScore.overall.toFixed(2)}.`,
            metrics: [
              `overall=${record.compositeScore.overall.toFixed(3)}`,
              `availability=${record.availabilityScore.toFixed(3)}`,
              `reliability=${record.reliabilityScore.toFixed(3)}`,
              `latencyScore=${record.compositeScore.latency.toFixed(3)}`,
            ],
            evidence: [
              record.explanation,
              `healthTrend=${record.telemetry.healthTrend}`,
              `errorRate=${record.telemetry.errorRate.toFixed(3)}`,
            ],
            confidence: clamp01(0.55 + record.compositeScore.overall * 0.4),
          },
        });
      }
    }

    return success(hints);
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
