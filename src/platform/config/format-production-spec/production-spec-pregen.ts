/**
 * Phase 5 — Pre-generation R/H short-circuit.
 * Do not spend provider budget on unconfirmed Research/Hold placements.
 */

import {
  isProductionRuleReleasable,
  resolveProductionRule,
} from "./resolve-production-rule";
import {
  productionSpecShouldEnforce,
  resolveProductionSpecRollout,
  type ProductionSpecRollout,
} from "./production-spec-rollout";
import { logProductionSpecTelemetry } from "./production-spec-telemetry";
import type { ProductionRule, ResolveProductionRuleInput } from "./types";

export type ProductionPregenHoldResult = {
  readonly blocked: boolean;
  readonly reason?: string;
  readonly rule?: ProductionRule;
  readonly rollout: ProductionSpecRollout;
};

export type EvaluateProductionPregenHoldInput = ResolveProductionRuleInput & {
  readonly confirmedOverride?: boolean;
  readonly organizationId?: string;
  readonly executionId?: string;
  readonly requestId?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly rollout?: ProductionSpecRollout;
};

/**
 * When Spec enforce is active and the matched rule is R/H without
 * confirmedOverride, block before the provider call.
 */
export function evaluateProductionPregenHold(
  input: EvaluateProductionPregenHoldInput,
): ProductionPregenHoldResult {
  const env = input.env ?? process.env;
  const rollout = input.rollout ?? resolveProductionSpecRollout(env);
  const enforce = productionSpecShouldEnforce({
    service: input.service,
    rollout,
    env,
  });

  const resolved = resolveProductionRule(input);
  if (!resolved) {
    return Object.freeze({ blocked: false, rollout });
  }

  const rule = resolved.rule;
  if (isProductionRuleReleasable(rule)) {
    return Object.freeze({ blocked: false, rule, rollout });
  }

  if (input.confirmedOverride) {
    return Object.freeze({ blocked: false, rule, rollout });
  }

  const reason = `PRODUCTION_PREGEN_HOLD: status ${rule.status} placement ${rule.id} requires confirmedOverride before generation`;

  logProductionSpecTelemetry({
    event: "production_spec.pregen_hold",
    organizationId: input.organizationId,
    executionId: input.executionId,
    requestId: input.requestId ?? input.executionId,
    productionRuleId: rule.id,
    authorityStatus: rule.status,
    service: input.service,
    platform: input.platform,
    rollout,
    enforced: enforce,
    observeOnly: !enforce,
    blocked: enforce,
    reason,
    status: enforce ? "BLOCK" : "SHADOW",
  });

  if (!enforce) {
    return Object.freeze({ blocked: false, rule, rollout, reason });
  }

  return Object.freeze({ blocked: true, rule, rollout, reason });
}

/** Read confirmedOverride from execution metadata. */
export function readConfirmedOverrideFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  if (!metadata) return false;
  const v =
    metadata.confirmedOverride ??
    metadata.productionConfirmedOverride ??
    metadata.productionHoldOverride;
  if (v === true || v === "true" || v === 1) return true;
  // CDF creative stages are exploratory directions/outputs — not a final
  // print-release handoff. Do not block AI/Hybrid CDF creates on R/H holds.
  if (
    (typeof metadata.cdfPhaseId === "string" && metadata.cdfPhaseId.trim()) ||
    (typeof metadata.cdfSessionId === "string" && metadata.cdfSessionId.trim())
  ) {
    return true;
  }
  return false;
}
