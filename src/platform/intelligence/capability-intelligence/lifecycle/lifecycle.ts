/**
 * Lifecycle / maturity / evolution / certification helpers.
 */

import type { CapabilityDefinitionRecord, CapabilityEvolutionMetrics } from "../contracts/capability";
import type { CapabilityMaturityReport } from "../contracts/scoring";
import type { CapabilityLifecycleState, CapabilityMaturity } from "../contracts/enums";

export function buildMaturityReport(cap: CapabilityDefinitionRecord): CapabilityMaturityReport {
  return {
    capabilityId: cap.capabilityId,
    maturity: cap.maturity,
    lifecycle: cap.lifecycle,
    version: cap.version,
    notes: `Capability ${cap.capabilityId} is ${cap.maturity} at lifecycle ${cap.lifecycle} (v${cap.version}).`,
  };
}

export function canEvolve(lifecycle: CapabilityLifecycleState): boolean {
  return lifecycle === "active" || lifecycle === "evolving" || lifecycle === "draft";
}

export function nextMaturity(current: CapabilityMaturity): CapabilityMaturity | undefined {
  const order: CapabilityMaturity[] = [
    "experimental",
    "preview",
    "stable",
    "enterprise",
  ];
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return undefined;
  return order[idx + 1];
}

export function defaultEvolution(capabilityId: string, version: string): CapabilityEvolutionMetrics {
  return {
    capabilityId,
    version,
    usageCount: 0,
    successRate: 0.8,
    failureRate: 0.2,
    averageQuality: 0.75,
    averageLatencyMs: 500,
    experienceContribution: 0,
  };
}

/** Soft certification gate — local to capability intelligence. */
export function isCertifiedForEnterprise(cap: CapabilityDefinitionRecord): boolean {
  return (
    (cap.maturity === "enterprise" || cap.maturity === "stable") &&
    cap.qualityExpectations.minQuality >= 0.7 &&
    cap.requiredEvaluators.length > 0
  );
}
