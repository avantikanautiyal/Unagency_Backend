/**
 * Optimization suggestions for capability bundles (advisory).
 */

import type { CapabilityDefinitionRecord } from "../contracts/capability";
import type { CapabilityScorecard } from "../contracts/scoring";

export interface CapabilityOptimizationHint {
  readonly capabilityId: string;
  readonly suggestion: string;
  readonly priority: "high" | "medium" | "low";
}

export function optimizeBundle(
  capabilities: readonly CapabilityDefinitionRecord[],
  scorecards: readonly CapabilityScorecard[]
): readonly CapabilityOptimizationHint[] {
  const hints: CapabilityOptimizationHint[] = [];
  const byId = new Map(scorecards.map((s) => [s.capabilityId, s]));

  for (const cap of capabilities) {
    const score = byId.get(cap.capabilityId);
    if (cap.maturity === "experimental") {
      hints.push({
        capabilityId: cap.capabilityId,
        suggestion: "Prefer pairing with a stable capability and require review gates.",
        priority: "high",
      });
    }
    if (score && score.scores.cost < 0.4) {
      hints.push({
        capabilityId: cap.capabilityId,
        suggestion: "High cost tier — consider caching / reuse or lower-cost alternative.",
        priority: "medium",
      });
    }
    if (cap.dependencies.length > 3) {
      hints.push({
        capabilityId: cap.capabilityId,
        suggestion: "Long dependency chain — consider a reusable sub-bundle.",
        priority: "low",
      });
    }
  }

  return hints;
}
