/**
 * Generic fanout certification criteria — harness / conformance only.
 *
 * Distinguishes:
 * - FLOW / PARTIAL AVAILABILITY certification (successfulLeaves >= 1,
 *   remaining leaves must be typed unavailable/failed — never silent-missing)
 * - FULL FANOUT certification (every declared leaf succeeds + lifecycle)
 *
 * Does NOT change runtime fanout cardinality, identity, ingest, or approval.
 * No service/phase/provider-specific branches.
 */

export type FanoutCertificationMode =
  | "flow_partial_availability"
  | "full_fanout";

/** Typed terminal states for non-success leaves (application-aligned). */
export type FanoutLeafTerminalKind =
  | "SUCCESS"
  | "PROVIDER_QUOTA_FAILURE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILURE"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_FAILURE"
  | "DOCUMENTPLAN_MISCLASSIFICATION"
  | "OTHER_FAILURE"
  | "MISSING_NOT_ATTEMPTED";

export type FanoutLeafCertSnapshot = {
  readonly generationFanoutTargetId: string;
  /** True when this declared target was planned/attempted/resolved (not silent-missing). */
  readonly attempted: boolean;
  readonly terminalKind: FanoutLeafTerminalKind;
  readonly generationExecutionId?: string | null;
  readonly artifactId?: string | null;
  readonly artifactVersion?: number | null;
  /** Post-reload exact X@V retained for this target (success leaves only). */
  readonly reloadRetainedExactXV?: boolean;
  /** UI projection shows this leaf's real media/output (not synthetic). */
  readonly uiProjectedRealOutput?: boolean;
  /** Synthetic card fabricated for an unavailable leaf — always illegal. */
  readonly uiSyntheticCard?: boolean;
  /** Approval pinned this leaf's exact targetId + X@V. */
  readonly approvedExact?: boolean;
  /** A sibling target was approved instead of / in addition to this leaf. */
  readonly siblingApproved?: boolean;
  /** Cross-leaf fallback consumed another leaf's provider/result. */
  readonly crossLeafFallback?: boolean;
  /** Successful leaf's artifact was replaced by another leaf's X@V. */
  readonly artifactSubstitutedBySibling?: boolean;
};

export type FanoutCertificationInput = {
  readonly declaredCardinality: number;
  readonly declaredTargetIds: readonly string[];
  readonly leaves: readonly FanoutLeafCertSnapshot[];
  /**
   * Count of usable generated outputs the REAL UI projection surface displays.
   * Must equal successfulLeaves when no synthetic cards exist.
   */
  readonly uiDisplayedSuccessfulOutputs?: number;
};

export type FanoutCertificationVerdict = {
  readonly declaredCardinality: number;
  readonly successfulTargetIds: readonly string[];
  readonly unavailableTargetIds: readonly string[];
  readonly missingTargetIds: readonly string[];
  readonly successfulCount: number;
  readonly unavailableCount: number;
  readonly missingCount: number;
  readonly flowCertPass: boolean;
  readonly fullFanoutCertPass: boolean;
  readonly defects: readonly {
    readonly code: string;
    readonly detail?: unknown;
  }[];
  readonly summary: {
    readonly declared: number;
    readonly successful: number;
    readonly unavailable: number;
    readonly missing: number;
    readonly flowCertification: "PASS" | "FAIL";
    readonly fullFanoutCertification: "PASS" | "NOT_SATISFIED" | "FAIL";
  };
};

const TYPED_UNAVAILABLE: ReadonlySet<FanoutLeafTerminalKind> = new Set([
  "PROVIDER_QUOTA_FAILURE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_AUTH_FAILURE",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_FAILURE",
  "DOCUMENTPLAN_MISCLASSIFICATION",
  "OTHER_FAILURE",
]);

function isSuccessLeaf(leaf: FanoutLeafCertSnapshot): boolean {
  return (
    leaf.attempted === true &&
    leaf.terminalKind === "SUCCESS" &&
    typeof leaf.artifactId === "string" &&
    leaf.artifactId.startsWith("cdfart_") &&
    typeof leaf.artifactVersion === "number" &&
    Number.isInteger(leaf.artifactVersion) &&
    Boolean(leaf.generationFanoutTargetId?.trim()) &&
    Boolean(leaf.generationExecutionId?.trim())
  );
}

function isTypedUnavailable(leaf: FanoutLeafCertSnapshot): boolean {
  return (
    leaf.attempted === true &&
    leaf.terminalKind !== "SUCCESS" &&
    leaf.terminalKind !== "MISSING_NOT_ATTEMPTED" &&
    TYPED_UNAVAILABLE.has(leaf.terminalKind)
  );
}

function isSilentMissing(leaf: FanoutLeafCertSnapshot): boolean {
  return (
    leaf.attempted !== true ||
    leaf.terminalKind === "MISSING_NOT_ATTEMPTED" ||
    !leaf.generationFanoutTargetId?.trim()
  );
}

/**
 * Evaluate fanout certification outcomes for FLOW and FULL modes.
 * Generic — no service/phase/provider names.
 */
export function evaluateFanoutCertification(
  input: FanoutCertificationInput,
): FanoutCertificationVerdict {
  const defects: { code: string; detail?: unknown }[] = [];
  const declared = input.declaredCardinality;
  const declaredIds = input.declaredTargetIds;

  if (!Number.isInteger(declared) || declared < 1) {
    defects.push({
      code: "declared_cardinality_invalid",
      detail: declared,
    });
  }

  if (declaredIds.length !== declared) {
    defects.push({
      code: "declared_target_ids_cardinality_mismatch",
      detail: { declared, declaredIds },
    });
  }

  if (new Set(declaredIds).size !== declaredIds.length) {
    defects.push({
      code: "declared_target_ids_not_unique",
      detail: declaredIds,
    });
  }

  // Every declared target must appear exactly once in leaves.
  const byTarget = new Map<string, FanoutLeafCertSnapshot>();
  for (const leaf of input.leaves) {
    const tid = leaf.generationFanoutTargetId?.trim() || "";
    if (!tid) {
      defects.push({
        code: "leaf_missing_target_id",
        detail: leaf,
      });
      continue;
    }
    if (byTarget.has(tid)) {
      defects.push({
        code: "duplicate_leaf_target_id",
        detail: tid,
      });
      continue;
    }
    byTarget.set(tid, leaf);
  }

  for (const tid of declaredIds) {
    if (!byTarget.has(tid)) {
      defects.push({
        code: "declared_target_not_resolved",
        detail: tid,
      });
    }
  }

  const successful: FanoutLeafCertSnapshot[] = [];
  const unavailable: FanoutLeafCertSnapshot[] = [];
  const missing: FanoutLeafCertSnapshot[] = [];

  for (const tid of declaredIds) {
    const leaf = byTarget.get(tid);
    if (!leaf) {
      missing.push({
        generationFanoutTargetId: tid,
        attempted: false,
        terminalKind: "MISSING_NOT_ATTEMPTED",
      });
      continue;
    }
    if (isSilentMissing(leaf) && leaf.terminalKind !== "SUCCESS") {
      missing.push(leaf);
      continue;
    }
    if (isSuccessLeaf(leaf)) {
      successful.push(leaf);
      continue;
    }
    if (isTypedUnavailable(leaf)) {
      // Success-shaped terminal without identity is not success and not typed unavailable.
      if (leaf.terminalKind === "SUCCESS") {
        defects.push({
          code: "success_without_canonical_identity",
          detail: {
            targetId: tid,
            artifactId: leaf.artifactId,
            artifactVersion: leaf.artifactVersion,
            generationExecutionId: leaf.generationExecutionId,
          },
        });
        missing.push({
          ...leaf,
          terminalKind: "MISSING_NOT_ATTEMPTED",
          attempted: false,
        });
      } else {
        unavailable.push(leaf);
      }
      continue;
    }
    // SUCCESS without full identity falls through
    if (leaf.terminalKind === "SUCCESS") {
      defects.push({
        code: "success_without_canonical_identity",
        detail: {
          targetId: tid,
          artifactId: leaf.artifactId,
          artifactVersion: leaf.artifactVersion,
          generationExecutionId: leaf.generationExecutionId,
        },
      });
      missing.push({
        ...leaf,
        terminalKind: "MISSING_NOT_ATTEMPTED",
        attempted: false,
      });
    } else {
      missing.push(leaf);
    }
  }

  // Successful leaf uniqueness
  const execIds = new Set(
    successful.map((l) => l.generationExecutionId).filter(Boolean),
  );
  const xvKeys = new Set(
    successful.map((l) => `${l.artifactId}@${l.artifactVersion}`),
  );
  if (execIds.size !== successful.length) {
    defects.push({
      code: "successful_leaves_share_execution_id",
      detail: [...execIds],
    });
  }
  if (xvKeys.size !== successful.length) {
    defects.push({
      code: "successful_leaves_share_xv",
      detail: [...xvKeys],
    });
  }

  for (const leaf of successful) {
    if (leaf.reloadRetainedExactXV === false) {
      defects.push({
        code: "successful_leaf_reload_lost_exact_xv",
        detail: leaf.generationFanoutTargetId,
      });
    }
    if (leaf.uiSyntheticCard === true) {
      defects.push({
        code: "synthetic_ui_card_for_leaf",
        detail: leaf.generationFanoutTargetId,
      });
    }
    if (leaf.uiProjectedRealOutput === false) {
      defects.push({
        code: "successful_leaf_not_projected",
        detail: leaf.generationFanoutTargetId,
      });
    }
    if (leaf.siblingApproved === true) {
      defects.push({
        code: "sibling_approved",
        detail: leaf.generationFanoutTargetId,
      });
    }
    if (leaf.crossLeafFallback === true) {
      defects.push({
        code: "cross_leaf_fallback",
        detail: leaf.generationFanoutTargetId,
      });
    }
    if (leaf.artifactSubstitutedBySibling === true) {
      defects.push({
        code: "artifact_substituted_by_sibling",
        detail: leaf.generationFanoutTargetId,
      });
    }
  }

  for (const leaf of unavailable) {
    if (leaf.uiSyntheticCard === true) {
      defects.push({
        code: "synthetic_ui_card_for_unavailable_leaf",
        detail: leaf.generationFanoutTargetId,
      });
    }
    // Unavailable must not carry a success X@V presentation as if generated.
    if (
      leaf.artifactId?.startsWith("cdfart_") &&
      leaf.uiProjectedRealOutput === true
    ) {
      defects.push({
        code: "unavailable_leaf_projected_as_success",
        detail: leaf.generationFanoutTargetId,
      });
    }
  }

  if (
    typeof input.uiDisplayedSuccessfulOutputs === "number" &&
    input.uiDisplayedSuccessfulOutputs !== successful.length
  ) {
    defects.push({
      code: "ui_displayed_count_mismatch",
      detail: {
        displayed: input.uiDisplayedSuccessfulOutputs,
        successful: successful.length,
      },
    });
  }

  const structuralOk = defects.length === 0;
  const noMissing = missing.length === 0;
  const flowCertPass =
    structuralOk &&
    declared >= 1 &&
    successful.length >= 1 &&
    noMissing &&
    successful.length + unavailable.length === declared;

  const fullFanoutCertPass =
    structuralOk &&
    noMissing &&
    unavailable.length === 0 &&
    successful.length === declared &&
    declared >= 1;

  return {
    declaredCardinality: declared,
    successfulTargetIds: successful.map((l) => l.generationFanoutTargetId),
    unavailableTargetIds: unavailable.map((l) => l.generationFanoutTargetId),
    missingTargetIds: missing.map((l) => l.generationFanoutTargetId),
    successfulCount: successful.length,
    unavailableCount: unavailable.length,
    missingCount: missing.length,
    flowCertPass,
    fullFanoutCertPass,
    defects,
    summary: {
      declared,
      successful: successful.length,
      unavailable: unavailable.length,
      missing: missing.length,
      flowCertification: flowCertPass ? "PASS" : "FAIL",
      fullFanoutCertification: fullFanoutCertPass
        ? "PASS"
        : flowCertPass
          ? "NOT_SATISFIED"
          : "FAIL",
    },
  };
}

/**
 * Whether a certification mode accepts the evaluated verdict.
 * FULL never weakens to partial success.
 */
export function modeAcceptsVerdict(
  mode: FanoutCertificationMode,
  verdict: FanoutCertificationVerdict,
): boolean {
  if (mode === "full_fanout") return verdict.fullFanoutCertPass;
  return verdict.flowCertPass;
}

/**
 * Classify a provider/runtime error string into a typed leaf terminal kind.
 * Generic — no service/phase names.
 */
export function classifyFanoutLeafFailure(
  message: string | null | undefined,
): Exclude<FanoutLeafTerminalKind, "SUCCESS" | "MISSING_NOT_ATTEMPTED"> {
  const s = String(message || "");
  if (/DocumentPlan/i.test(s)) return "DOCUMENTPLAN_MISCLASSIFICATION";
  if (
    /quota|credits?\s+are\s+exhausted|credit_balance_exhausted|insufficient.?quota|billing/i.test(
      s,
    )
  ) {
    return "PROVIDER_QUOTA_FAILURE";
  }
  if (/401|unauthorized|auth|api.?key|credential/i.test(s)) {
    return "PROVIDER_AUTH_FAILURE";
  }
  if (/429|rate.?limit/i.test(s)) return "PROVIDER_RATE_LIMIT";
  if (/unavailable|not.?configured|UNAVAILABLE/i.test(s)) {
    return "PROVIDER_UNAVAILABLE";
  }
  if (/provider|model|openai|google|gemini|runtime/i.test(s)) {
    return "PROVIDER_FAILURE";
  }
  return "OTHER_FAILURE";
}
