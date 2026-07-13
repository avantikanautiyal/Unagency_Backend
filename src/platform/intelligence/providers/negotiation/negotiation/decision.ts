/**
 * Negotiation decision + confidence computation.
 *
 * Purpose: Pure functions turning diagnostics into a decision and confidence.
 * Responsibilities: Deterministic decision/confidence math.
 * Usage: Used by the engine after all stages complete.
 * Future Extension: Weighted, preference-aware confidence.
 */

import type {
  NegotiationFailure,
  NegotiationWarning,
} from "../contracts/diagnostics";
import type { NegotiationDecision } from "../contracts/enums";

export function decide(
  failures: readonly NegotiationFailure[],
  warnings: readonly NegotiationWarning[]
): NegotiationDecision {
  if (failures.length > 0) {
    return "rejected";
  }
  if (warnings.length > 0) {
    return "accepted_with_warnings";
  }
  return "accepted";
}

/**
 * Confidence in [0, 1]. Each failure costs 0.4, each warning costs 0.1.
 */
export function computeConfidence(
  failures: readonly NegotiationFailure[],
  warnings: readonly NegotiationWarning[]
): number {
  const penalty = failures.length * 0.4 + warnings.length * 0.1;
  const raw = Math.max(0, 1 - penalty);
  return Math.round(raw * 100) / 100;
}
