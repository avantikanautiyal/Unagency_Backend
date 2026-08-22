/**
 * Phase 7 — Conflict resolution precedence:
 * SYSTEM/SAFETY → GOVERNANCE → OUTPUT_CONTRACT → BRAND → EXECUTION → USER
 */

import type {
  RefinementConflict,
  RequestedChange,
} from "../contracts/refinement-specification";

export interface ConflictContext {
  readonly outputContractId?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly prohibitedPatterns?: readonly string[];
  readonly brandTone?: string;
  /** Signals that would remove mandatory contract elements */
  readonly mandatoryPreserve?: readonly string[];
}

const AGGRESSIVE_SIGNALS = new Set([
  "tone.bold",
  "tone.aggressive",
  "copy.aggressive",
  "brand_alignment.claims",
]);

const CTA_REMOVE_SIGNALS = new Set(["cta.remove", "dissatisfaction.remove_cta"]);

export function resolveRefinementConflicts(
  changes: readonly RequestedChange[],
  ctx: ConflictContext
): {
  readonly accepted: readonly RequestedChange[];
  readonly conflicts: readonly RefinementConflict[];
  readonly forcedPreserve: readonly string[];
} {
  const accepted: RequestedChange[] = [];
  const conflicts: RefinementConflict[] = [];
  const forcedPreserve: string[] = [];

  const brandBlocksAggressive =
    Boolean(ctx.brandTone && /premium|confident|luxury|professional/i.test(ctx.brandTone)) ||
    (ctx.prohibitedPatterns ?? []).some((p) => /aggress|guaranteed|cure/i.test(p)) ||
    (ctx.brandAvoidTerms ?? []).some((t) => /aggress|hype|cheap/i.test(t));

  const contractRequiresCta =
    (ctx.outputContractId ?? "").includes("landing") ||
    (ctx.mandatoryPreserve ?? []).includes("cta");

  for (const change of changes) {
    // Brand / governance: aggressive tone vs brand policy
    if (
      brandBlocksAggressive &&
      (AGGRESSIVE_SIGNALS.has(change.signal) ||
        change.value === "aggressive" ||
        /aggress/i.test(change.signal))
    ) {
      conflicts.push({
        code: "BRAND_OVERRIDE_DENIED",
        message:
          "Aggressive messaging preference conflicts with brand/governance constraints",
        userSignal: change.signal,
        winningConstraint: "BRAND",
        resolution: "rejected",
      });
      forcedPreserve.push("brand_voice");
      continue;
    }

    // Output contract: cannot remove CTA on landing pages
    if (contractRequiresCta && CTA_REMOVE_SIGNALS.has(change.signal)) {
      conflicts.push({
        code: "CONTRACT_CTA_REQUIRED",
        message: "Output contract requires CTA; removal rejected",
        userSignal: change.signal,
        winningConstraint: "OUTPUT_CONTRACT",
        resolution: "preserved_mandatory",
      });
      forcedPreserve.push("cta");
      accepted.push({
        ...change,
        signal: "cta.clearer",
        value: "clearer",
        dimension: "cta",
      });
      continue;
    }

    // Explicit keep-cta remove attempt via value
    if (
      contractRequiresCta &&
      change.dimension === "cta" &&
      (change.value === "remove" || change.signal.endsWith(".remove"))
    ) {
      conflicts.push({
        code: "CONTRACT_CTA_REQUIRED",
        message: "CTA is mandatory for this output contract",
        userSignal: change.signal,
        winningConstraint: "OUTPUT_CONTRACT",
        resolution: "preserved_mandatory",
      });
      forcedPreserve.push("cta");
      continue;
    }

    accepted.push(change);
  }

  return { accepted, conflicts, forcedPreserve };
}
