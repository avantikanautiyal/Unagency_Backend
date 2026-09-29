/**
 * Generic CDF phase completion contract for approval / advance guards.
 *
 * PHASE COMPLETION (when the phase contract requires canonical create) =
 *   exact ArtifactVersion X@V exists
 *   AND required role pin is session-bound
 *   AND completion is durable in the artifact bag
 *   AND artifact satisfies the phase contract
 *
 * No serviceId / phaseId / provider branches.
 */

import {
  resolveCdfPhaseDefinition,
  resolveCdfPhaseExecutionContract,
  type CdfPhaseDefinition,
  type CdfPhaseExecutionContract,
} from "../canonical";
import { getArtifactVersion } from "../artifacts/repository";
import { isCdfCanonicalArtifactId } from "../artifacts/ids";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";

export type CdfPhaseCompletionStatus =
  | "complete"
  | "pending"
  | "missing_artifact"
  | "identity_required"
  | "identity_mismatch"
  | "not_durable"
  | "role_insufficient"
  | "diagnostic_only"
  | "version_not_current"
  | "not_applicable";

export type CdfSelectionCompletionStatus =
  | "selected"
  | "not_selected"
  | "not_applicable";

export type CdfApprovalCompletionStatus =
  | "approved"
  | "not_approved"
  | "not_applicable";

export type CdfDurabilityCompletionStatus =
  | "durable"
  | "missing_in_store"
  | "not_checked"
  | "not_applicable";

export type CdfApprovalPreconditionFailureCode =
  | "CDF_CANONICAL_COMPLETION_REQUIRED"
  | "CDF_CANONICAL_IDENTITY_REQUIRED"
  | "CDF_CANONICAL_ARTIFACT_MISMATCH"
  | "CDF_ARTIFACT_NOT_DURABLE"
  | "CDF_SELECTION_REQUIRED_BEFORE_APPROVAL"
  | "CDF_DIAGNOSTIC_PREVIEW_NOT_APPROVABLE"
  | "CDF_STALE_ARTIFACT_VERSION"
  | "CDF_PHASE_NOT_APPROVABLE"
  | "CDF_FANOUT_TARGET_ID_REQUIRED";

export type CdfPhaseCompletionResolution = {
  completionStatus: CdfPhaseCompletionStatus;
  selectionStatus: CdfSelectionCompletionStatus;
  approvalStatus: CdfApprovalCompletionStatus;
  durabilityStatus: CdfDurabilityCompletionStatus;
  transitionAllowed: boolean;
  failureCode?: CdfApprovalPreconditionFailureCode;
  requiredArtifactKey?: string;
  /** Role that must exist before approve may establish approval / advance. */
  requiredRole: "generated" | "selected" | "approved";
  requiredArtifactId?: string;
  requiredArtifactVersion?: number;
  phaseId: string;
  message?: string;
};

export type CdfPhaseProgressStatus =
  | "upcoming"
  | "active"
  | "completed"
  | "incomplete"
  | "failed";

function matchPin(
  r: CdfSessionArtifactRef,
  phaseId: string,
  artifactKey?: string,
): boolean {
  if (r.phaseId !== phaseId) return false;
  if (
    !Number.isInteger(r.version) ||
    (r.version as number) < 1 ||
    !isCdfCanonicalArtifactId(String(r.artifactId ?? ""))
  ) {
    return false;
  }
  if (
    artifactKey &&
    r.artifactKey &&
    r.artifactKey !== "unknown" &&
    r.artifactKey !== artifactKey
  ) {
    return false;
  }
  return true;
}

function findPin(
  list: CdfSessionArtifactRef[] | undefined,
  phaseId: string,
  artifactKey?: string,
): CdfSessionArtifactRef | undefined {
  return list?.find((r) => matchPin(r, phaseId, artifactKey));
}

/**
 * Exact ArtifactVersion X@V among phase pins.
 * Fanout leaves share artifactKey — never use first-match for approval identity.
 */
function findExactPin(
  list: CdfSessionArtifactRef[] | undefined,
  phaseId: string,
  artifactId: string,
  version: number,
  artifactKey?: string,
  generationFanoutTargetId?: string,
): CdfSessionArtifactRef | undefined {
  const fanout = generationFanoutTargetId?.trim() || "";
  return list?.find((r) => {
    if (!matchPin(r, phaseId, artifactKey)) return false;
    if (r.artifactId !== artifactId || r.version !== version) return false;
    if (fanout) {
      // Strict leaf scope — pins missing targetId never satisfy a fanout request.
      return r.generationFanoutTargetId === fanout;
    }
    return true;
  });
}

function sessionFanoutPinsForPhase(
  session: CdfSessionState,
  phaseId: string,
  artifactKey?: string,
): CdfSessionArtifactRef[] {
  const lists = [
    session.generatedArtifacts,
    session.selectedArtifacts,
    session.approvedArtifacts,
  ];
  const out: CdfSessionArtifactRef[] = [];
  for (const list of lists) {
    for (const r of list ?? []) {
      if (!matchPin(r, phaseId, artifactKey)) continue;
      if (r.generationFanoutTargetId?.trim()) out.push(r);
    }
  }
  return out;
}

/**
 * Resolve the completing pin by exact requested X@V across role-eligible lists.
 * Selected/approved satisfy a generated precondition; never substitute another fanout leaf.
 */
function findExactCompletingPin(
  session: CdfSessionState,
  phaseId: string,
  artifactKey: string | undefined,
  requiredRole: "generated" | "selected" | "approved",
  artifactId: string,
  version: number,
  generationFanoutTargetId?: string,
): CdfSessionArtifactRef | undefined {
  const approved = findExactPin(
    session.approvedArtifacts,
    phaseId,
    artifactId,
    version,
    artifactKey,
    generationFanoutTargetId,
  );
  const selected = findExactPin(
    session.selectedArtifacts,
    phaseId,
    artifactId,
    version,
    artifactKey,
    generationFanoutTargetId,
  );
  const generated = findExactPin(
    session.generatedArtifacts,
    phaseId,
    artifactId,
    version,
    artifactKey,
    generationFanoutTargetId,
  );

  if (requiredRole === "approved") return approved;
  if (requiredRole === "selected") return selected ?? approved;
  // generated precondition: any stronger role with the same X@V also satisfies.
  return approved ?? selected ?? generated;
}

/**
 * Role that must already be session-bound before approve may advance.
 * Approve itself establishes `approved`; it must not invent the underlying
 * generated ArtifactVersion. Selected/approved pins also satisfy (stronger).
 *
 * When a caller explicitly requires selected/approved (test / select-gated
 * completion), pass `requiredRole` into resolvePhaseCompletionForApproval.
 */
export function requiredRoleForApprovalPrecondition(
  _phase?: CdfPhaseDefinition,
): "generated" | "selected" {
  void _phase;
  return "generated";
}

function resolveCompletingPin(
  session: CdfSessionState,
  phaseId: string,
  artifactKey: string | undefined,
  requiredRole: "generated" | "selected" | "approved",
): CdfSessionArtifactRef | undefined {
  // Stronger roles may satisfy weaker preconditions (approved ⇒ selected ⇒ generated).
  const approved = findPin(session.approvedArtifacts, phaseId, artifactKey);
  if (requiredRole === "approved") return approved;
  if (approved) return approved;
  const selected = findPin(session.selectedArtifacts, phaseId, artifactKey);
  if (requiredRole === "selected") return selected;
  if (selected) return selected;
  return findPin(session.generatedArtifacts, phaseId, artifactKey);
}

function checkDurability(
  pin: CdfSessionArtifactRef,
  session: CdfSessionState,
): CdfDurabilityCompletionStatus {
  try {
    const ownership = {
      organizationId: session.organizationId,
      projectId: session.projectId,
    };
    const exact = getArtifactVersion(pin.artifactId, pin.version, ownership);
    return exact ? "durable" : "missing_in_store";
  } catch {
    return "missing_in_store";
  }
}

function isDiagnosticOnlyEligibility(status: string | undefined): boolean {
  const s = (status ?? "").trim().toUpperCase();
  return s === "DIAGNOSTIC_PREVIEW_AVAILABLE" || s === "DIAGNOSTIC_ONLY";
}

/**
 * Resolve whether the current phase is canonically complete enough to approve
 * and advance the state machine.
 */
export function resolvePhaseCompletionForApproval(input: {
  session: CdfSessionState;
  phaseId: string;
  serviceId?: string;
  phase?: CdfPhaseDefinition;
  contract?: CdfPhaseExecutionContract;
  /**
   * Override the pin role required before approve.
   * Default: generated (selected/approved also satisfy).
   * Pass "selected" / "approved" to assert stricter completion.
   */
  requiredRole?: "generated" | "selected" | "approved";
  requestArtifactId?: string;
  requestArtifactVersion?: number;
  requestArtifactKey?: string;
  /** Fanout leaf disambiguation — optional; exact X@V remains authoritative. */
  requestGenerationFanoutTargetId?: string;
  requestPresentationEligibility?: string;
}): CdfPhaseCompletionResolution {
  const serviceId = input.serviceId ?? input.session.serviceId;
  const phase =
    input.phase ?? resolveCdfPhaseDefinition(serviceId, input.phaseId);
  const contract =
    input.contract ??
    resolveCdfPhaseExecutionContract({
      serviceId,
      phaseId: input.phaseId,
      phase,
    });

  const requiredRole =
    input.requiredRole ?? requiredRoleForApprovalPrecondition(phase);

  const base = {
    phaseId: input.phaseId,
    requiredRole: requiredRole as "generated" | "selected" | "approved",
    selectionStatus: "not_applicable" as CdfSelectionCompletionStatus,
    approvalStatus: "not_applicable" as CdfApprovalCompletionStatus,
    durabilityStatus: "not_applicable" as CdfDurabilityCompletionStatus,
  };

  if (phase && phase.approval?.mode === "not_applicable") {
    return {
      ...base,
      completionStatus: "not_applicable",
      transitionAllowed: false,
      failureCode: "CDF_PHASE_NOT_APPROVABLE",
      message: `Phase "${input.phaseId}" does not accept approval`,
    };
  }

  // Non-canonical phases retain legacy approve behavior (no ArtifactVersion pin).
  if (!contract?.requiresCanonicalCreate) {
    return {
      ...base,
      completionStatus: "complete",
      transitionAllowed: true,
      requiredArtifactKey: contract?.artifactKey,
    };
  }

  const artifactKey =
    input.requestArtifactKey?.trim() ||
    contract.artifactKey ||
    phase?.artifact?.artifactKey;

  const selectedPin = findPin(
    input.session.selectedArtifacts,
    input.phaseId,
    artifactKey,
  );
  const approvedPin = findPin(
    input.session.approvedArtifacts,
    input.phaseId,
    artifactKey,
  );
  const generatedPin = findPin(
    input.session.generatedArtifacts,
    input.phaseId,
    artifactKey,
  );

  const selectionStatus: CdfSelectionCompletionStatus =
    selectedPin || approvedPin
      ? "selected"
      : generatedPin
        ? "not_selected"
        : "not_applicable";

  const approvalStatus: CdfApprovalCompletionStatus = approvedPin
    ? "approved"
    : "not_approved";

  if (isDiagnosticOnlyEligibility(input.requestPresentationEligibility)) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      selectionStatus,
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: "diagnostic_only",
      transitionAllowed: false,
      failureCode: "CDF_DIAGNOSTIC_PREVIEW_NOT_APPROVABLE",
      message:
        "Diagnostic preview cannot satisfy canonical approval completion",
    };
  }

  // Pinned / durable alone is insufficient — acceptance must not be blocked.
  const eligibilityUpper = (input.requestPresentationEligibility ?? "")
    .trim()
    .toUpperCase();
  if (
    eligibilityUpper === "REJECTED" ||
    eligibilityUpper === "UNVERIFIABLE" ||
    eligibilityUpper === "FAILED"
  ) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      selectionStatus,
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: "diagnostic_only",
      transitionAllowed: false,
      failureCode: "CDF_ACCEPTANCE_BLOCKED_NOT_APPROVABLE",
      message:
        "Structurally rejected or unverifiable deliverables cannot be approved",
    };
  }

  if (requiredRole === "selected" && !selectedPin && !approvedPin) {
    const genOnly = Boolean(generatedPin);
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      selectionStatus: "not_selected",
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: genOnly ? "role_insufficient" : "missing_artifact",
      transitionAllowed: false,
      failureCode: "CDF_SELECTION_REQUIRED_BEFORE_APPROVAL",
      requiredArtifactId: generatedPin?.artifactId,
      requiredArtifactVersion: generatedPin?.version,
      message: genOnly
        ? `Phase "${input.phaseId}" has a generated artifact but requires selection before approval`
        : `Phase "${input.phaseId}" requires a selected ArtifactVersion before approval`,
    };
  }

  if (requiredRole === "approved" && !approvedPin) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      selectionStatus,
      approvalStatus: "not_approved",
      durabilityStatus: "not_checked",
      completionStatus: selectedPin || generatedPin
        ? "role_insufficient"
        : "missing_artifact",
      transitionAllowed: false,
      failureCode: "CDF_CANONICAL_COMPLETION_REQUIRED",
      requiredArtifactId: (selectedPin ?? generatedPin)?.artifactId,
      requiredArtifactVersion: (selectedPin ?? generatedPin)?.version,
      message: `Phase "${input.phaseId}" requires an approved ArtifactVersion`,
    };
  }

  const hintPin = resolveCompletingPin(
    input.session,
    input.phaseId,
    artifactKey,
    requiredRole,
  );

  const fanoutPins = sessionFanoutPinsForPhase(
    input.session,
    input.phaseId,
    artifactKey,
  );
  const requestFanout = input.requestGenerationFanoutTargetId?.trim() || "";
  // C6: when fanout-scoped pins exist, approve must name the leaf — never first-match.
  if (fanoutPins.length > 0 && !requestFanout) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      requiredArtifactId: hintPin?.artifactId,
      requiredArtifactVersion: hintPin?.version,
      selectionStatus,
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: "identity_required",
      transitionAllowed: false,
      failureCode: "CDF_FANOUT_TARGET_ID_REQUIRED",
      message: `Approve requires generationFanoutTargetId when ${fanoutPins.length} fanout leaf pin(s) exist for ${artifactKey ?? input.phaseId}`,
    };
  }

  const reqId = input.requestArtifactId?.trim();
  const reqVer = input.requestArtifactVersion;
  if (!reqId || reqVer == null || !Number.isInteger(reqVer)) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      requiredArtifactId: hintPin?.artifactId,
      requiredArtifactVersion: hintPin?.version,
      selectionStatus,
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: hintPin ? "identity_required" : "missing_artifact",
      transitionAllowed: false,
      failureCode: hintPin
        ? "CDF_CANONICAL_IDENTITY_REQUIRED"
        : "CDF_CANONICAL_COMPLETION_REQUIRED",
      message: hintPin
        ? `Approve requires exact ${artifactKey ?? input.phaseId} artifactId and artifactVersion`
        : `Phase "${input.phaseId}" has no canonical ArtifactVersion for approval`,
    };
  }

  // Website HTML/ZIP homepage options use art_* export ids (no cdfart pin).
  // allowNonVisualReady phases may approve these when the client names the leaf.
  const isWebsiteExportArtifact =
    reqId.startsWith("art_webexport") ||
    reqId.startsWith("art_website") ||
    reqId.startsWith("art_webproject");
  if (
    !hintPin &&
    contract.allowNonVisualReady &&
    isWebsiteExportArtifact
  ) {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      requiredArtifactId: reqId,
      requiredArtifactVersion: reqVer,
      selectionStatus:
        selectionStatus === "not_applicable" ? "selected" : selectionStatus,
      approvalStatus,
      durabilityStatus: "durable",
      completionStatus: "complete",
      transitionAllowed: true,
    };
  }

  // Exact requested X@V — fanout-safe (never first-match another leaf).
  try {
    console.info(
      JSON.stringify({
        scope: "cdf.state_machine",
        event: "approval_identity_compare",
        phaseId: input.phaseId,
        requestArtifactId: reqId,
        requestArtifactVersion: reqVer,
        requestArtifactKey: input.requestArtifactKey ?? null,
        requestGenerationFanoutTargetId:
          input.requestGenerationFanoutTargetId ?? null,
        authoritativeArtifactId: hintPin?.artifactId ?? null,
        authoritativeArtifactVersion: hintPin?.version ?? null,
        authoritativeArtifactKey: hintPin?.artifactKey ?? artifactKey ?? null,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore logging failures
  }
  const pin = findExactCompletingPin(
    input.session,
    input.phaseId,
    artifactKey,
    requiredRole,
    reqId,
    reqVer,
    input.requestGenerationFanoutTargetId,
  );

  if (!pin) {
    // allowNonVisualReady + website export: accept even when session has no
    // cdfart pin yet (homepage HTML options from WebsiteRoutes materialization).
    if (contract.allowNonVisualReady && isWebsiteExportArtifact) {
      return {
        ...base,
        requiredArtifactKey: artifactKey,
        requiredArtifactId: reqId,
        requiredArtifactVersion: reqVer,
        selectionStatus:
          selectionStatus === "not_applicable" ? "selected" : selectionStatus,
        approvalStatus,
        durabilityStatus: "durable",
        completionStatus: "complete",
        transitionAllowed: true,
      };
    }
    const sameIdPins = [
      ...(input.session.approvedArtifacts ?? []),
      ...(input.session.selectedArtifacts ?? []),
      ...(input.session.generatedArtifacts ?? []),
    ].filter(
      (r) =>
        matchPin(r, input.phaseId, artifactKey) && r.artifactId === reqId,
    );
    const newestSameId = sameIdPins
      .slice()
      .sort((a, b) => b.version - a.version)[0];
    if (
      newestSameId &&
      typeof reqVer === "number" &&
      reqVer < newestSameId.version
    ) {
      return {
        ...base,
        requiredArtifactKey: artifactKey,
        requiredArtifactId: newestSameId.artifactId,
        requiredArtifactVersion: newestSameId.version,
        selectionStatus,
        approvalStatus,
        durabilityStatus: "not_checked",
        completionStatus: "version_not_current",
        transitionAllowed: false,
        failureCode: "CDF_STALE_ARTIFACT_VERSION",
        message: `Approve must use current ${artifactKey ?? input.phaseId} @${newestSameId.version}, not older @${reqVer}`,
      };
    }
    if (hintPin) {
      return {
        ...base,
        requiredArtifactKey: artifactKey,
        requiredArtifactId: hintPin.artifactId,
        requiredArtifactVersion: hintPin.version,
        selectionStatus,
        approvalStatus,
        durabilityStatus: "not_checked",
        completionStatus: "identity_mismatch",
        transitionAllowed: false,
        failureCode: "CDF_CANONICAL_ARTIFACT_MISMATCH",
        message: `Approve must pin the exact ${artifactKey ?? input.phaseId} ArtifactVersion`,
      };
    }
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      selectionStatus,
      approvalStatus,
      durabilityStatus: "not_checked",
      completionStatus: "missing_artifact",
      transitionAllowed: false,
      failureCode: "CDF_CANONICAL_COMPLETION_REQUIRED",
      message: `Phase "${input.phaseId}" has no canonical ArtifactVersion for approval`,
    };
  }

  const durabilityStatus = checkDurability(pin, input.session);
  if (durabilityStatus !== "durable") {
    return {
      ...base,
      requiredArtifactKey: artifactKey,
      requiredArtifactId: pin.artifactId,
      requiredArtifactVersion: pin.version,
      selectionStatus,
      approvalStatus,
      durabilityStatus,
      completionStatus: "not_durable",
      transitionAllowed: false,
      failureCode: "CDF_ARTIFACT_NOT_DURABLE",
      message: `Canonical ArtifactVersion ${pin.artifactId}@${pin.version} is not durable in the artifact store`,
    };
  }

  return {
    ...base,
    requiredArtifactKey: artifactKey,
    requiredArtifactId: pin.artifactId,
    requiredArtifactVersion: pin.version,
    selectionStatus,
    approvalStatus,
    durabilityStatus,
    completionStatus: "complete",
    transitionAllowed: true,
  };
}

/**
 * Whether a prior phase may be shown as completed in progress UI.
 * Contract-driven; fails closed when canonical completion is absent.
 */
export function isPhaseAuthoritativelyComplete(
  session: CdfSessionState,
  phaseId: string,
  serviceId?: string,
): boolean {
  const sid = serviceId ?? session.serviceId;
  const phase = resolveCdfPhaseDefinition(sid, phaseId);
  const contract = resolveCdfPhaseExecutionContract({
    serviceId: sid,
    phaseId,
    phase,
  });

  if (!phase) {
    return (
      session.approved.some((a) => a.phaseId === phaseId) ||
      session.selected.some((s) => s.phaseId === phaseId)
    );
  }

  if (!contract?.requiresCanonicalCreate) {
    if (phase.approval?.mode === "required") {
      return session.approved.some((a) => a.phaseId === phaseId);
    }
    if (
      phase.selection?.mode === "required_one" ||
      phase.selection?.mode === "required_many"
    ) {
      return (
        session.selected.some((s) => s.phaseId === phaseId) ||
        session.approved.some((a) => a.phaseId === phaseId)
      );
    }
    return (
      session.approved.some((a) => a.phaseId === phaseId) ||
      session.selected.some((s) => s.phaseId === phaseId) ||
      session.phaseIndex >
        (typeof phase.phaseOrder === "number" ? phase.phaseOrder : -1)
    );
  }

  const artifactKey = phase.artifact?.artifactKey;
  if (phase.approval?.mode === "required") {
    return Boolean(findPin(session.approvedArtifacts, phaseId, artifactKey));
  }
  if (
    phase.selection?.mode === "required_one" ||
    phase.selection?.mode === "required_many" ||
    phase.artifact?.selectable
  ) {
    return Boolean(
      findPin(session.selectedArtifacts, phaseId, artifactKey) ||
        findPin(session.approvedArtifacts, phaseId, artifactKey),
    );
  }
  return Boolean(
    findPin(session.generatedArtifacts, phaseId, artifactKey) ||
      findPin(session.selectedArtifacts, phaseId, artifactKey) ||
      findPin(session.approvedArtifacts, phaseId, artifactKey),
  );
}

/**
 * Authoritative per-phase progress for UI — never infer completion from index alone.
 */
export function resolvePhaseProgressStatuses(
  session: CdfSessionState,
  phases: ReadonlyArray<{ id: string }>,
): CdfPhaseProgressStatus[] {
  return phases.map((p, i) => {
    if (session.phaseIndex < 0) return "upcoming";
    if (i > session.phaseIndex) return "upcoming";
    if (i === session.phaseIndex) return "active";
    return isPhaseAuthoritativelyComplete(session, p.id, session.serviceId)
      ? "completed"
      : "incomplete";
  });
}

/**
 * Structured diagnostic for approve/advance attempts.
 */
export function logApprovalPrecondition(input: {
  sessionId: string;
  sessionVersion: number;
  phaseId: string;
  nextPhaseId?: string | null;
  resolution: CdfPhaseCompletionResolution;
  /** Exact request identity compared against session pins (diagnostic). */
  requestArtifactId?: string | null;
  requestArtifactVersion?: number | null;
  requestArtifactKey?: string | null;
  requestGenerationFanoutTargetId?: string | null;
}): void {
  try {
    console.info(
      JSON.stringify({
        scope: "cdf.state_machine",
        event: "approval_precondition",
        sessionId: input.sessionId,
        sessionVersion: input.sessionVersion,
        phaseId: input.phaseId,
        nextPhaseId: input.nextPhaseId ?? null,
        requiredArtifactKey: input.resolution.requiredArtifactKey ?? null,
        requiredRole: input.resolution.requiredRole,
        requiredArtifactId: input.resolution.requiredArtifactId ?? null,
        requiredArtifactVersion:
          input.resolution.requiredArtifactVersion ?? null,
        requestArtifactId: input.requestArtifactId ?? null,
        requestArtifactVersion: input.requestArtifactVersion ?? null,
        requestArtifactKey: input.requestArtifactKey ?? null,
        requestGenerationFanoutTargetId:
          input.requestGenerationFanoutTargetId ?? null,
        completionStatus: input.resolution.completionStatus,
        selectionStatus: input.resolution.selectionStatus,
        approvalStatus: input.resolution.approvalStatus,
        durabilityStatus: input.resolution.durabilityStatus,
        transitionAllowed: input.resolution.transitionAllowed,
        failureCode: input.resolution.failureCode ?? null,
        ts: new Date().toISOString(),
      }),
    );
  } catch {
    // ignore logging failures
  }
}
