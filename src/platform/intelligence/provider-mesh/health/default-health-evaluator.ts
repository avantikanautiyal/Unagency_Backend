/**
 * Health evaluator + provider state machine.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderMeshEvent } from "../contracts/inputs";
import type { ProviderOperationalRecord, ProviderTelemetryWindow } from "../contracts/state";
import type { ProviderOperationalState } from "../contracts/enums";
import type { IHealthEvaluator } from "../interfaces/mesh";
import {
  BUSY_UTILIZATION,
  DEGRADED_ERROR_RATE,
  UNAVAILABLE_ERROR_RATE,
} from "../constants";

export class DefaultHealthEvaluator implements IHealthEvaluator {
  evaluate(
    providerId: string,
    telemetry: ProviderTelemetryWindow,
    events: readonly ProviderMeshEvent[]
  ): Result<Pick<ProviderOperationalRecord, "state" | "healthScore" | "explanation">> {
    const latest = events[events.length - 1];
    let state: ProviderOperationalState = "healthy";

    if (latest?.maintenance || events.some((e) => e.maintenance)) {
      state = "maintenance";
    } else if (latest?.deprecated || events.some((e) => e.deprecated)) {
      state = "deprecated";
    } else if (
      latest?.experimental ||
      events.some((e) => e.experimental) ||
      latest?.certificationStatus === "experimental" ||
      events.some((e) => e.certificationStatus === "experimental")
    ) {
      state = "experimental";
    } else if (
      latest?.rateLimited ||
      events.some((e) => e.rateLimited) ||
      (telemetry.errorRate >= 0.25 && telemetry.capacityUtilization >= 0.9)
    ) {
      state = "rate_limited";
    } else if (
      telemetry.errorRate >= UNAVAILABLE_ERROR_RATE ||
      telemetry.availability < 0.3 ||
      events.some(
        (e) =>
          e.health &&
          (!e.health.healthy ||
            e.health.state === "disabled" ||
            e.health.state === "retired")
      ) ||
      latest?.certificationStatus === "rejected"
    ) {
      state = "unavailable";
    } else if (
      telemetry.errorRate >= DEGRADED_ERROR_RATE ||
      telemetry.timeoutRate >= 0.2 ||
      telemetry.healthTrend === "worsening"
    ) {
      state = "degraded";
    } else if (telemetry.capacityUtilization >= BUSY_UTILIZATION) {
      state = "busy";
    } else {
      state = "healthy";
    }

    const healthScore = clamp01(
      telemetry.availability * 0.45 +
        (1 - telemetry.errorRate) * 0.35 +
        (1 - telemetry.timeoutRate) * 0.1 +
        stateBonus(state) * 0.1
    );

    return success({
      state,
      healthScore,
      explanation: `Provider ${providerId} classified as ${state} (availability=${telemetry.availability.toFixed(2)}, errorRate=${telemetry.errorRate.toFixed(2)}, utilization=${telemetry.capacityUtilization.toFixed(2)}).`,
    });
  }
}

function stateBonus(state: ProviderOperationalState): number {
  switch (state) {
    case "healthy":
      return 1;
    case "busy":
      return 0.7;
    case "experimental":
      return 0.6;
    case "degraded":
    case "rate_limited":
      return 0.35;
    case "deprecated":
      return 0.25;
    case "maintenance":
    case "unavailable":
      return 0;
    default:
      return 0.5;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
