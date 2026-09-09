/**
 * Phase 5 — Spec telemetry (ruleId, edition, prompt-block hash, gate outcome).
 * No secrets; tenant-safe summaries only.
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import {
  FORMAT_PRODUCTION_SPEC_EDITION,
  PRODUCTION_SPEC_STACK_PROVENANCE,
} from "./edition";
import type { ProductionReleaseDecision } from "./production-release-decision";
import type { ProductionSpecRollout } from "./production-spec-rollout";

export type ProductionSpecTelemetryEvent =
  | "production_spec.instruct"
  | "production_spec.gate"
  | "production_spec.pregen_hold"
  | "production_spec.rollout_skip"
  | "production_spec.visual_field_guide_evidence";

export type ProductionSpecTelemetryFields = {
  readonly event: ProductionSpecTelemetryEvent;
  readonly organizationId?: string;
  readonly executionId?: string;
  readonly requestId?: string;
  readonly productionRuleId?: string;
  readonly edition?: string;
  readonly provenance?: string;
  readonly promptBlockHash?: string;
  readonly authorityStatus?: string;
  readonly service?: string;
  readonly platform?: string;
  readonly rollout?: ProductionSpecRollout;
  readonly injected?: boolean;
  readonly enforced?: boolean;
  readonly observeOnly?: boolean;
  readonly allowed?: boolean;
  readonly decision?: ProductionReleaseDecision | string;
  readonly status?: string;
  readonly reason?: string;
  readonly blocked?: boolean;
};

export function logProductionSpecTelemetry(
  fields: ProductionSpecTelemetryFields,
): void {
  const safe = sanitizeOsLogFields({
    ...fields,
    edition: fields.edition ?? FORMAT_PRODUCTION_SPEC_EDITION,
    provenance: fields.provenance ?? PRODUCTION_SPEC_STACK_PROVENANCE,
  });
  console.log(`[UNAGENCY OS] ${JSON.stringify(safe)}`);
}
