/**
 * Default routing diagnostics.
 */

import type { RoutingDecision } from "../contracts/plan";
import type { RoutingRequest } from "../contracts/request";
import type {
  IRoutingDiagnostics,
  RoutingDiagnosticReport,
} from "../interfaces/routing";
import { buildTopology } from "../topology/topology-builder";

export class DefaultRoutingDiagnostics implements IRoutingDiagnostics {
  analyze(
    request: RoutingRequest,
    decision?: RoutingDecision
  ): RoutingDiagnosticReport {
    const unhealthyProviders = request.candidates
      .filter((c) => !c.healthy)
      .map((c) => String(c.providerId));
    const constraintViolations: string[] = [];
    for (const c of request.constraints ?? []) {
      if (c.maxLatencyMs) {
        constraintViolations.push(
          ...request.candidates
            .filter(
              (p) =>
                p.estimatedLatencyMs !== undefined &&
                p.estimatedLatencyMs > c.maxLatencyMs!
            )
            .map(
              (p) =>
                `${String(p.providerId)} exceeds latency ${c.maxLatencyMs}ms`
            )
        );
      }
    }
    const experimentConflicts =
      decision?.plan.experiments.length &&
      decision.plan.experiments.some((e) => e.kind === "canary") &&
      decision.plan.experiments.some((e) => e.kind === "shadow")
        ? ["canary and shadow experiments both active"]
        : [];

    return {
      missingProviders:
        request.candidates.length === 0 ? ["no candidates supplied"] : [],
      constraintViolations,
      unhealthyProviders,
      experimentConflicts,
    };
  }

  topology(request: RoutingRequest) {
    return buildTopology(request, new Date().toISOString());
  }
}
