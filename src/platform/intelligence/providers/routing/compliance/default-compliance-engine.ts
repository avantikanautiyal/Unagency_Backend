/**
 * Default compliance engine.
 */

import { success, type Result } from "../../../shared/result";
import type { RoutingCandidate } from "../contracts/candidate";
import type { RoutingConstraint } from "../contracts/policy";
import type {
  ComplianceOutcome,
  IRoutingComplianceEngine,
} from "../interfaces/routing";

export class DefaultComplianceEngine implements IRoutingComplianceEngine {
  evaluate(
    candidate: RoutingCandidate,
    constraints: readonly RoutingConstraint[] = []
  ): Result<ComplianceOutcome> {
    const reasons: string[] = [];
    let allowed = true;

    for (const c of constraints) {
      if (c.region && candidate.region && c.region !== candidate.region) {
        allowed = false;
        reasons.push(`region mismatch: required ${c.region}`);
      }
      if (
        c.maxLatencyMs !== undefined &&
        candidate.estimatedLatencyMs !== undefined &&
        candidate.estimatedLatencyMs > c.maxLatencyMs
      ) {
        allowed = false;
        reasons.push(`latency ${candidate.estimatedLatencyMs}ms exceeds ${c.maxLatencyMs}ms`);
      }
      if (
        c.maxCost !== undefined &&
        candidate.estimatedCost !== undefined &&
        candidate.estimatedCost > c.maxCost
      ) {
        allowed = false;
        reasons.push(`cost exceeds max ${c.maxCost}`);
      }
      if (
        c.minQuality !== undefined &&
        candidate.qualityScore !== undefined &&
        candidate.qualityScore < c.minQuality
      ) {
        allowed = false;
        reasons.push(`quality below min ${c.minQuality}`);
      }
      if (!candidate.healthy && c.required) {
        allowed = false;
        reasons.push("provider unhealthy");
      }
    }

    return success({
      allowed,
      score: allowed ? 1 : 0,
      reasons,
    });
  }

  filter(
    candidates: readonly RoutingCandidate[],
    constraints?: readonly RoutingConstraint[]
  ): Result<readonly RoutingCandidate[]> {
    const allowed: RoutingCandidate[] = [];
    for (const c of candidates) {
      const outcome = this.evaluate(c, constraints);
      if (outcome.ok && outcome.value.allowed) {
        allowed.push(c);
      }
    }
    return success(allowed);
  }
}
