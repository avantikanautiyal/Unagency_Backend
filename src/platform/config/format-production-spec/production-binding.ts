/**
 * Production Spec binding — metadata contract.
 *
 * Every creatable execution should carry `productionRuleId` + Spec provenance
 * so prompt injection and release enforcement evaluate the same rule.
 * Runtime stamping: applyProductionSpecInstructToMetadata / stampExecutionSpecMetadata.
 */

import {
  FORMAT_PRODUCTION_SPEC_EDITION,
  FORMAT_PRODUCTION_SPEC_PROVENANCE,
  PRODUCTION_SPEC_STACK_PROVENANCE,
  SERVICE_HYGIENE_REFERENCE_PROVENANCE,
  VISUAL_FIELD_GUIDE_PROVENANCE,
} from "./edition";
import type {
  AuthorityStatus,
  ResolvedProductionRule,
} from "./types";

/** Metadata key for the denormalized Spec binding on execution metadata. */
export const PRODUCTION_SPEC_BINDING_METADATA_KEY =
  "productionSpecBinding" as const;

/**
 * Binding stamped alongside (or inside) execution metadata so instruct and
 * enforce share one productionRuleId.
 */
export type ProductionSpecBinding = {
  readonly productionRuleId: string;
  readonly edition: typeof FORMAT_PRODUCTION_SPEC_EDITION;
  readonly formatProvenance: typeof FORMAT_PRODUCTION_SPEC_PROVENANCE;
  readonly hygieneProvenance: typeof SERVICE_HYGIENE_REFERENCE_PROVENANCE;
  /** Phase 6 — Visual Field Guide edition identity. */
  readonly visualGuideProvenance: typeof VISUAL_FIELD_GUIDE_PROVENANCE;
  readonly stackProvenance: typeof PRODUCTION_SPEC_STACK_PROVENANCE;
  readonly authorityStatus: AuthorityStatus;
  readonly matchedBy?: ResolvedProductionRule["matchedBy"];
  /** Set when a prompt block was built for this binding (Phase 1+). */
  readonly promptBlockHash?: string;
  readonly boundAt?: string;
};

export type BuildProductionSpecBindingInput = {
  readonly ruleId: string;
  readonly authorityStatus: AuthorityStatus;
  readonly matchedBy?: ResolvedProductionRule["matchedBy"];
  readonly promptBlockHash?: string;
  readonly boundAt?: string;
};

export function freezeProductionSpecBinding(
  input: BuildProductionSpecBindingInput,
): ProductionSpecBinding {
  return Object.freeze({
    productionRuleId: input.ruleId,
    edition: FORMAT_PRODUCTION_SPEC_EDITION,
    formatProvenance: FORMAT_PRODUCTION_SPEC_PROVENANCE,
    hygieneProvenance: SERVICE_HYGIENE_REFERENCE_PROVENANCE,
    visualGuideProvenance: VISUAL_FIELD_GUIDE_PROVENANCE,
    stackProvenance: PRODUCTION_SPEC_STACK_PROVENANCE,
    authorityStatus: input.authorityStatus,
    ...(input.matchedBy ? { matchedBy: input.matchedBy } : {}),
    ...(input.promptBlockHash
      ? { promptBlockHash: input.promptBlockHash }
      : {}),
    ...(input.boundAt ? { boundAt: input.boundAt } : {}),
  });
}

export function buildProductionSpecBindingFromResolved(
  resolved: ResolvedProductionRule,
  extras?: {
    readonly promptBlockHash?: string;
    readonly boundAt?: string;
  },
): ProductionSpecBinding {
  return freezeProductionSpecBinding({
    ruleId: resolved.rule.id,
    authorityStatus: resolved.rule.status,
    matchedBy: resolved.matchedBy,
    promptBlockHash: extras?.promptBlockHash,
    boundAt: extras?.boundAt,
  });
}

export function isProductionSpecBinding(
  value: unknown,
): value is ProductionSpecBinding {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.productionRuleId === "string" &&
    v.productionRuleId.length > 0 &&
    typeof v.edition === "string" &&
    typeof v.stackProvenance === "string" &&
    typeof v.authorityStatus === "string"
  );
}

export function readProductionSpecBinding(
  metadata?: Readonly<Record<string, unknown>>,
): ProductionSpecBinding | undefined {
  if (!metadata) return undefined;
  const raw = metadata[PRODUCTION_SPEC_BINDING_METADATA_KEY];
  if (!isProductionSpecBinding(raw)) return undefined;
  return raw;
}

/**
 * Pure merge helper for Phase 1 stamp paths. Does not mutate the input object.
 */
export function withProductionSpecBinding(
  metadata: Readonly<Record<string, unknown>>,
  binding: ProductionSpecBinding,
): Record<string, unknown> {
  return Object.freeze({
    ...metadata,
    [PRODUCTION_SPEC_BINDING_METADATA_KEY]: binding,
    productionRuleId: binding.productionRuleId,
    productionSpecProvenance: binding.stackProvenance,
  });
}
