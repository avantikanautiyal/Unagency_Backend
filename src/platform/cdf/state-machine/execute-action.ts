/**
 * M1B — Server-authoritative CDF action executor.
 *
 * ACTION → load → validate version/service/phase/action/deps → mutate → CAS persist → nextWork
 */

import { failure, success, type Result } from "../../core/result";
import {
  CDF_CONTRACT_VERSION,
  resolveCdfCanonicalService,
  nextWorkForPhase as canonicalNextWorkForPhase,
  toLegacyNextWork,
  resolveCdfRouteInputRequirement,
  composeCdfRouteDescWithInput,
  type CdfPhaseDefinition,
} from "../canonical";
import { resolveCdfPostBriefStart } from "../brief-start";
import { resolveCdfServiceConfig } from "../service-configs";
import {
  resolveVideoAdvanceAfterApproval,
  resolveVideoStudioHandoffPhaseId,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/video-subtype-deliverable-profiles";
import {
  compareAndSwapCdfSession,
  createCdfSessionId,
  getCdfSession,
  persistCdfSession,
  persistCdfSessionCas,
  saveCdfSession,
} from "../session-store";
import type { CdfGenerationContinuationSelection,
  CdfApprovedPhase,
  CdfFlowPhase,
  CdfSelectedPhase,
  CdfServiceConfig,
  CdfSessionState,
  CdfTransitionAction,
  CdfTransitionRequest,
  CdfTransitionResult,
  CdfUiHint,
} from "../types";
import { cdfError, type CdfTransitionErrorCode } from "./errors";
import { bumpSessionVersion, normalizeCdfSession } from "./normalize";
import { captureSourceAndResolveSync, getLatestActiveBrief } from "../requirements";
import {
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
  CdfArtifactError,
  getArtifact,
  getArtifactVersion,
  isCdfCanonicalArtifactId,
} from "../artifacts";
import { extractChoiceArrayFromArtifactData } from "../generation-context/resolve-selected-choice";
import {
  assertCdfPhaseDependencies,
  selectRequiresExactArtifactIdentity,
  sessionHasCanonicalArtifactRefs,
} from "../lifecycle/dependency-satisfaction";
import {
  logApprovalPrecondition,
  resolvePhaseCompletionForApproval,
  resolvePhaseProgressStatuses,
} from "../lifecycle/phase-completion";
import { creativeQaBlocksRelease } from "../../os/evaluation/creative-score/creative-qa-rollout";
import { getExecutionReleaseGate } from "../social-media-runtime/execution-release-gate";
import {
  isValidCdfPhaseExecutionTarget,
  resolveCdfPhaseExecutionContract,
} from "../canonical";

export type Prepared =
  | { kind: "start_done"; result: CdfTransitionResult }
  | { kind: "replay"; result: CdfTransitionResult }
  | {
      kind: "mutate";
      expectedVersion: number;
      next: CdfSessionState;
      config: CdfServiceConfig;
      nextWork: CdfTransitionResult["nextWork"];
      meta: {
        action: string;
        previousPhase?: string | null;
        requestKey?: string;
      };
    };

function nowIso(): string {
  return new Date().toISOString();
}

function extractBrandNameFromBrief(brief: string): string | undefined {
  const patterns = [
    /Brand name:\s*([^\n]+)/i,
    /(?:logo|identity|branding)\s+for\s+(?:my\s+brand\s+)?([A-Z][A-Za-z0-9&'.-]{1,40})/i,
    /(?:brand|company|product)\s+(?:name\s+)?(?:is|called|:)\s*["']?([A-Z][A-Za-z0-9&'.-]{1,40})/i,
    /(?:named|called)\s+["']?([A-Z][A-Za-z0-9&'.-]{1,40})["']?/i,
  ];
  for (const pattern of patterns) {
    const match = brief.match(pattern);
    const name = match?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[.,;:]+$/, "");
    if (
      name &&
      name.length >= 2 &&
      !/^(the|a|an|my|our|this|that|new|fun|logo|brand)$/i.test(name)
    ) {
      return name;
    }
  }
  return undefined;
}

function extractColorTokensFromBrief(brief: string): string[] {
  const hex = brief.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) ?? [];
  const names =
    brief.match(
      /\b(red|blue|green|yellow|orange|purple|pink|black|white|grey|gray|brown|beige|cream|gold|silver|teal|navy|coral|mint|olive|charcoal|maroon|saffron|rust)\b/gi,
    ) ?? [];
  return [...new Set([...hex, ...names.map((n) => n.toLowerCase())])].slice(
    0,
    8,
  );
}

function isApproved(session: CdfSessionState, phaseId: string): boolean {
  return session.approved.some((a) => a.phaseId === phaseId);
}

function currentPhase(
  config: CdfServiceConfig,
  session: CdfSessionState,
): CdfFlowPhase | null {
  if (session.phaseIndex < 0 || session.phaseIndex >= config.phases.length) {
    return null;
  }
  return config.phases[session.phaseIndex] ?? null;
}

function canonicalPhaseFor(
  serviceId: string,
  phaseId: string | null | undefined,
): CdfPhaseDefinition | undefined {
  if (!phaseId) return undefined;
  const svc = resolveCdfCanonicalService(serviceId);
  return svc?.phases.find((p) => p.phaseId === phaseId);
}

/** Selection-only phases (approval not_applicable) complete on select. */
function isStudioHandoffPhaseComplete(
  session: CdfSessionState,
  handoffId: string,
): boolean {
  if (isApproved(session, handoffId)) return true;
  return (
    canonicalPhaseFor(session.serviceId, handoffId)?.approval.mode ===
      "not_applicable" &&
    (session.selected ?? []).some((s) => s.phaseId === handoffId)
  );
}

function assertActiveCanonicalPhase(
  serviceId: string,
  phaseId: string,
): Result<CdfPhaseDefinition> {
  const phase = canonicalPhaseFor(serviceId, phaseId);
  if (!phase) {
    return failure(
      cdfError("INVALID_PHASE", `Unknown phase "${phaseId}"`, {
        serviceId,
        phaseId,
      }),
    );
  }
  if (phase.implementationStatus !== "active") {
    return failure(
      cdfError(
        "PHASE_INACTIVE",
        `Phase "${phaseId}" is ${phase.implementationStatus} and not active in runtime`,
        { serviceId, phaseId, status: phase.implementationStatus },
      ),
    );
  }
  return success(phase);
}

function mapLegacyActionToCanonical(
  action: CdfTransitionAction,
): "start" | "submit_brief" | "select" | "approve" | "refine" | "final_action" | "handoff_studio" {
  if (action === "select_route") return "select";
  // Continuity selection is a select-class action (≠ approve / ≠ canonical).
  if (action === "select_generation_for_continuation") return "select";
  if (action === "reopen_route_selection") return "select";
  return action;
}

export function buildAuthoritativeUi(
  config: CdfServiceConfig,
  session: CdfSessionState,
): CdfUiHint {
  const phase = currentPhase(config, session);
  const allowedActions: CdfTransitionAction[] = [];

  if (session.status === "handed_off" || session.modeOwnership === "studio") {
    return {
      progressLabels: config.phases.map((p) => p.progressLabel),
      currentPhaseIndex: session.phaseIndex,
      phaseProgressStatuses: resolvePhaseProgressStatuses(session, config.phases),
      currentPhase: phase,
      allowedActions: [],
      showSendToStudio: false,
      refineExamples: [],
      finalActions: [],
    };
  }

  if (session.status === "completed") {
    return {
      progressLabels: config.phases.map((p) => p.progressLabel),
      currentPhaseIndex: session.phaseIndex,
      phaseProgressStatuses: resolvePhaseProgressStatuses(session, config.phases),
      currentPhase: phase,
      allowedActions: phase?.type === "final" ? ["final_action"] : [],
      showSendToStudio: false,
      refineExamples: [],
      finalActions: phase?.type === "final" ? phase.finalActions ?? [] : [],
    };
  }

  if (session.phaseIndex < 0 || session.status === "awaiting_brief") {
    allowedActions.push("submit_brief");
  } else if (phase) {
    const canonical = canonicalPhaseFor(session.serviceId, phase.id);
    if (canonical) {
      for (const a of canonical.allowedActions) {
        if (a === "select") allowedActions.push("select_route");
        else if (
          a === "approve" ||
          a === "refine" ||
          a === "final_action" ||
          a === "handoff_studio"
        ) {
          allowedActions.push(a);
        }
      }
    } else {
      if (phase.type === "routes") allowedActions.push("select_route");
      if (
        phase.type === "text-approval" ||
        phase.type === "output" ||
        phase.type === "mockup" ||
        phase.type === "multi-output"
      ) {
        allowedActions.push("approve", "refine");
      }
      if (
        phase.type === "output" ||
        phase.type === "mockup" ||
        phase.type === "multi-output"
      ) {
        allowedActions.push("select_generation_for_continuation");
      }
      if (phase.type === "final") allowedActions.push("final_action");
    }
    // Presentation compatibility: design-routes remains selectable while
    // canonical `select` is contract_only (empty allowedActions on design-routes).
    if (phase.type === "routes" && !allowedActions.includes("select_route")) {
      allowedActions.push("select_route");
    }
    if (
      (phase.type === "output" ||
        phase.type === "mockup" ||
        phase.type === "multi-output") &&
      !allowedActions.includes("select_generation_for_continuation")
    ) {
      allowedActions.push("select_generation_for_continuation");
    }
  }

  const handoffId =
    resolveVideoStudioHandoffPhaseId({
      service: "video",
      subtype: session.masters?.productSubtype,
      defaultPhaseId: config.studioHandoffAfterPhaseId,
    }) ?? config.studioHandoffAfterPhaseId;
  const showSendToStudio =
    session.productMode === "hybrid" &&
    Boolean(handoffId) &&
    isStudioHandoffPhaseComplete(session, handoffId!) &&
    session.modeOwnership === "ai";

  if (showSendToStudio && !allowedActions.includes("handoff_studio")) {
    allowedActions.push("handoff_studio");
  }

  // Do not advertise approve when canonical completion is absent.
  if (phase && allowedActions.includes("approve")) {
    const completion = resolvePhaseCompletionForApproval({
      session,
      phaseId: phase.id,
      serviceId: session.serviceId,
    });
    // Missing identity on the request is OK for CTA visibility — only hide when
    // the underlying ArtifactVersion pin itself is absent / not durable / diagnostic.
    if (
      !completion.transitionAllowed &&
      (completion.completionStatus === "missing_artifact" ||
        completion.completionStatus === "not_durable" ||
        completion.completionStatus === "diagnostic_only" ||
        completion.completionStatus === "role_insufficient" ||
        completion.completionStatus === "not_applicable")
    ) {
      const idx = allowedActions.indexOf("approve");
      if (idx >= 0) allowedActions.splice(idx, 1);
    }
  }

  return {
    progressLabels: config.phases.map((p) => p.progressLabel),
    currentPhaseIndex: session.phaseIndex,
    phaseProgressStatuses: resolvePhaseProgressStatuses(session, config.phases),
    currentPhase: phase,
    allowedActions,
    showSendToStudio,
    refineExamples: phase?.refineExamples ?? [],
    finalActions: phase?.type === "final" ? phase.finalActions ?? [] : [],
  };
}

export function resolveAuthoritativeNextWork(
  config: CdfServiceConfig,
  session: CdfSessionState,
  override?: CdfTransitionResult["nextWork"],
): CdfTransitionResult["nextWork"] {
  if (override) return override;
  if (session.status === "awaiting_brief" || session.phaseIndex < 0) {
    return { kind: "await_brief" };
  }
  if (session.status === "handed_off") {
    return { kind: "studio_handoff" };
  }
  const phase = currentPhase(config, session);
  if (!phase) return { kind: "none" };

  const canonical = canonicalPhaseFor(session.serviceId, phase.id);
  if (canonical) {
    return toLegacyNextWork(canonicalNextWorkForPhase(canonical));
  }
  // Phase definition missing from canonical registry — fail closed (never
  // invent nextWork from legacy phase.generator).
  return { kind: "none" };
}

function resultOf(
  session: CdfSessionState,
  config: CdfServiceConfig,
  nextWork: CdfTransitionResult["nextWork"],
  opts?: { idempotentReplay?: boolean },
): CdfTransitionResult {
  const normalized = normalizeCdfSession(session);
  return {
    session: normalized,
    config,
    ui: buildAuthoritativeUi(config, normalized),
    nextWork,
    version: normalized.sessionVersion,
    ...(opts?.idempotentReplay ? { idempotentReplay: true } : {}),
  };
}

function requestFingerprint(req: CdfTransitionRequest): string {
  if (req.requestId?.trim()) return `id:${req.requestId.trim()}`;
  return [
    req.action,
    req.expectedVersion ?? "",
    req.routeIndex ?? "",
    req.routeTitle ?? "",
    req.routeLabel ?? "",
    req.routeInput ?? "",
    req.brief ?? "",
    req.refinePrompt ?? "",
    req.finalAction ?? "",
    req.finalActionId ?? "",
    req.artifactId ?? "",
    req.artifactVersion ?? "",
    req.executionId ?? "",
    req.platform ?? "",
    req.format ?? "",
  ].join("|");
}

function advanceToPhase(
  session: CdfSessionState,
  config: CdfServiceConfig,
  index: number,
): Pick<CdfSessionState, "phaseIndex" | "phaseId" | "status"> {
  if (index < 0) {
    return { phaseIndex: -1, phaseId: null, status: "awaiting_brief" };
  }
  const phase = config.phases[index];
  // Final phase is still "active" until final_action / handoff — hybrid needs
  // showSendToStudio after creative approve while sitting on final.
  return {
    phaseIndex: index,
    phaseId: phase?.id ?? null,
    status: "active",
  };
}

function assertDependencies(
  session: CdfSessionState,
  phase: CdfFlowPhase,
  canonical?: CdfPhaseDefinition,
): Result<true> {
  const sat = assertCdfPhaseDependencies(session, phase, canonical);
  if (!sat.ok) {
    const depId = sat.dependencyPhaseId ?? "unknown";
    const roleHint =
      sat.requiredRole === "selected"
        ? "selected/approved"
        : sat.requiredRole === "approved"
          ? "approved"
          : sat.requiredRole;
    const detail =
      sat.reason === "not_approved" || sat.reason === "not_selected"
        ? `Phase "${phase.id}" requires ${roleHint} CDF artifact for "${depId}" (exact version)`
        : `Phase "${phase.id}" requires CDF dependency "${depId}" (${roleHint})`;
    return failure(
      cdfError("DEPENDENCY_NOT_SATISFIED", detail, {
        phaseId: phase.id,
        dependency: depId,
        requiredRole: sat.requiredRole,
        dependencyReason: sat.reason,
        generatedOnlyPresent: sat.generatedOnlyPresent,
      }),
    );
  }
  return success(true);
}

function logTransition(input: {
  sessionId?: string;
  serviceId?: string;
  action: string;
  previousPhase?: string | null;
  nextPhase?: string | null;
  previousVersion?: number;
  newVersion?: number;
  result: "ok" | "error";
  errorCode?: CdfTransitionErrorCode;
  requestKey?: string;
}): void {
  try {
    // Structured, no prompt bodies
    console.info(
      JSON.stringify({
        scope: "cdf.state_machine",
        ...input,
        ts: nowIso(),
      }),
    );
  } catch {
    // ignore logging failures
  }
}

async function commit(
  expectedVersion: number,
  next: CdfSessionState,
  config: CdfServiceConfig,
  nextWork: CdfTransitionResult["nextWork"],
  meta: {
    action: string;
    previousPhase?: string | null;
    requestKey?: string;
  },
): Promise<Result<CdfTransitionResult>> {
  let saved: CdfSessionState | undefined;
  try {
    saved = await persistCdfSessionCas(expectedVersion, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logTransition({
      sessionId: next.sessionId,
      serviceId: next.serviceId,
      action: meta.action,
      previousPhase: meta.previousPhase,
      previousVersion: expectedVersion,
      result: "error",
      errorCode: "DURABILITY_FAILED",
      requestKey: meta.requestKey,
    });
    return failure(
      cdfError("DURABILITY_FAILED", message, {
        sessionId: next.sessionId,
        expectedVersion,
        reason: "CDF_SESSION_DURABILITY_FAILED",
      }),
    );
  }
  if (!saved) {
    logTransition({
      sessionId: next.sessionId,
      serviceId: next.serviceId,
      action: meta.action,
      previousPhase: meta.previousPhase,
      previousVersion: expectedVersion,
      result: "error",
      errorCode: "SESSION_VERSION_CONFLICT",
      requestKey: meta.requestKey,
    });
    return failure(
      cdfError(
        "SESSION_VERSION_CONFLICT",
        `Session version conflict: expected ${expectedVersion}`,
        {
          sessionId: next.sessionId,
          expectedVersion,
          currentVersion: getCdfSession(next.sessionId)?.sessionVersion,
        },
      ),
    );
  }
  logTransition({
    sessionId: saved.sessionId,
    serviceId: saved.serviceId,
    action: meta.action,
    previousPhase: meta.previousPhase,
    nextPhase: saved.phaseId,
    previousVersion: expectedVersion,
    newVersion: saved.sessionVersion,
    result: "ok",
    requestKey: meta.requestKey,
  });
  return success(resultOf(saved, config, nextWork));
}

function handleStart(
  req: CdfTransitionRequest,
): Result<CdfTransitionResult> {
  const serviceKey = req.serviceId;
  if (!serviceKey) {
    return failure(
      cdfError("INVALID_ACTION_PAYLOAD", "serviceId is required for start"),
    );
  }
  const config = resolveCdfServiceConfig(serviceKey);
  if (!config) {
    return failure(
      cdfError("INVALID_SERVICE", `Unknown CDF service: ${serviceKey}`),
    );
  }
  if (
    req.contractVersion &&
    req.contractVersion !== CDF_CONTRACT_VERSION &&
    !req.contractVersion.startsWith("2.0.")
  ) {
    return failure(
      cdfError(
        "CONTRACT_VERSION_MISMATCH",
        `Unsupported contractVersion ${req.contractVersion}`,
        { expected: CDF_CONTRACT_VERSION, got: req.contractVersion },
      ),
    );
  }

  const ts = nowIso();
  const session: CdfSessionState = normalizeCdfSession({
    sessionId: createCdfSessionId(),
    serviceId: config.serviceId,
    organizationId: req.organizationId,
    workspaceId: req.workspaceId,
    projectId: req.projectId,
    userId: req.userId,
    contractVersion: CDF_CONTRACT_VERSION,
    sessionVersion: 1,
    status: "awaiting_brief",
    brief: undefined,
    phaseIndex: -1,
    phaseId: null,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: req.productMode ?? "ai",
    createdAt: ts,
    updatedAt: ts,
    ...(req.requestId?.trim()
      ? { lastRequestKey: `id:${req.requestId.trim()}` }
      : {}),
  });
  saveCdfSession(session);
  void persistCdfSession(session).catch(() => undefined);
  logTransition({
    sessionId: session.sessionId,
    serviceId: session.serviceId,
    action: "start",
    nextPhase: null,
    previousVersion: 0,
    newVersion: 1,
    result: "ok",
  });
  return success(resultOf(session, config, { kind: "await_brief" }));
}

function syncCommit(
  expectedVersion: number,
  next: CdfSessionState,
  config: CdfServiceConfig,
  nextWork: CdfTransitionResult["nextWork"],
  meta: {
    action: string;
    previousPhase?: string | null;
    requestKey?: string;
  },
): Result<CdfTransitionResult> {
  const saved = compareAndSwapCdfSession(
    next.sessionId,
    expectedVersion,
    next,
  );
  if (!saved) {
    logTransition({
      sessionId: next.sessionId,
      serviceId: next.serviceId,
      action: meta.action,
      previousPhase: meta.previousPhase,
      previousVersion: expectedVersion,
      result: "error",
      errorCode: "SESSION_VERSION_CONFLICT",
      requestKey: meta.requestKey,
    });
    return failure(
      cdfError(
        "SESSION_VERSION_CONFLICT",
        `Session version conflict: expected ${expectedVersion}`,
        {
          sessionId: next.sessionId,
          expectedVersion,
          currentVersion: getCdfSession(next.sessionId)?.sessionVersion,
        },
      ),
    );
  }
  // Best-effort durable flush of the already CAS'd memory snapshot.
  // Do NOT call persistCdfSessionCas again — memory version already advanced.
  void persistCdfSession(saved).catch(() => undefined);
  logTransition({
    sessionId: saved.sessionId,
    serviceId: saved.serviceId,
    action: meta.action,
    previousPhase: meta.previousPhase,
    nextPhase: saved.phaseId,
    previousVersion: expectedVersion,
    newVersion: saved.sessionVersion,
    result: "ok",
    requestKey: meta.requestKey,
  });
  return success(resultOf(saved, config, nextWork));
}

export function prepareTransition(
  req: CdfTransitionRequest,
): Result<Prepared> {
  if (req.action === "start") {
    const started = handleStart(req);
    if (!started.ok) return started;
    return success({ kind: "start_done", result: started.value });
  }

  const sessionId = req.sessionId;
  if (!sessionId) {
    return failure(
      cdfError("INVALID_ACTION_PAYLOAD", "sessionId is required"),
    );
  }
  const existingRaw = getCdfSession(sessionId);
  if (!existingRaw) {
    return failure(
      cdfError("SESSION_NOT_FOUND", `CDF session not found: ${sessionId}`, {
        sessionId,
      }),
    );
  }
  const existing = normalizeCdfSession(existingRaw);
  const fingerprint = requestFingerprint(req);

  if (req.requestId?.trim() && existing.lastRequestKey === fingerprint) {
    const config = resolveCdfServiceConfig(existing.serviceId);
    if (!config) {
      return failure(
        cdfError("INVALID_SERVICE", `Unknown CDF service: ${existing.serviceId}`),
      );
    }
    return success({
      kind: "replay",
      result: resultOf(existing, config, resolveAuthoritativeNextWork(config, existing), {
        idempotentReplay: true,
      }),
    });
  }

  if (
    req.contractVersion &&
    existing.contractVersion &&
    req.contractVersion !== existing.contractVersion &&
    !req.contractVersion.startsWith("2.0.")
  ) {
    return failure(
      cdfError(
        "CONTRACT_VERSION_MISMATCH",
        `Session contract ${existing.contractVersion} != request ${req.contractVersion}`,
      ),
    );
  }

  const expectedVersion =
    typeof req.expectedVersion === "number"
      ? req.expectedVersion
      : existing.sessionVersion;

  if (expectedVersion !== existing.sessionVersion) {
    return failure(
      cdfError(
        "SESSION_VERSION_CONFLICT",
        `Session version conflict: expected ${expectedVersion}, current ${existing.sessionVersion}`,
        {
          sessionId,
          expectedVersion,
          currentVersion: existing.sessionVersion,
        },
      ),
    );
  }

  if (
    (existing.status === "handed_off" || existing.modeOwnership === "studio") &&
    req.action !== "handoff_studio"
  ) {
    return failure(
      cdfError(
        "SESSION_ALREADY_COMPLETE",
        "Session handed off to studio — AI transitions are locked",
        { status: existing.status },
      ),
    );
  }

  if (
    existing.status === "completed" &&
    req.action !== "final_action" &&
    req.action !== "handoff_studio"
  ) {
    return failure(
      cdfError("SESSION_ALREADY_COMPLETE", "Session already completed", {
        status: existing.status,
        phaseId: existing.phaseId,
      }),
    );
  }

  const config = resolveCdfServiceConfig(existing.serviceId);
  if (!config) {
    return failure(
      cdfError("INVALID_SERVICE", `Unknown CDF service: ${existing.serviceId}`),
    );
  }

  const previousPhase = existing.phaseId;
  const metaBase = {
    action: req.action,
    previousPhase,
    requestKey: fingerprint,
  };

  if (req.action === "submit_brief") {
    if (existing.status !== "awaiting_brief" && existing.phaseIndex >= 0) {
      if (existing.brief && existing.brief === (req.brief ?? "").trim()) {
        return success({
          kind: "replay",
          result: resultOf(
            existing,
            config,
            resolveAuthoritativeNextWork(config, existing),
            { idempotentReplay: true },
          ),
        });
      }
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          "submit_brief is only valid while awaiting brief",
        ),
      );
    }
    const brief = (req.brief ?? "").trim();
    if (!brief) {
      return failure(cdfError("INVALID_ACTION_PAYLOAD", "brief is required"));
    }

    // M2 — Requirement Engine captures SourceInput + ActiveBrief (does not own phase transition).
    let activeBriefId: string | undefined;
    let activeBriefVersion: number | undefined;
    try {
      const captured = captureSourceAndResolveSync({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        projectId: req.projectId ?? existing.projectId,
        userId: req.userId ?? existing.userId,
        type: "user_prompt",
        rawContent: brief,
        source: "cdf_submit_brief",
        metadata: {
          platform: req.platform,
          format: req.format,
          subtype: req.subtype,
          category: req.category,
        },
      });
      activeBriefId = captured.brief.activeBriefId;
      activeBriefVersion = captured.brief.version;
    } catch (err) {
      logTransition({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        action: "submit_brief",
        previousPhase: existing.phaseId,
        result: "error",
        errorCode: "INVALID_ACTION_PAYLOAD",
        requestKey: fingerprint,
      });
      return failure(
        cdfError(
          "INVALID_ACTION_PAYLOAD",
          err instanceof Error
            ? `Requirement capture failed: ${err.message}`
            : "Requirement capture failed",
        ),
      );
    }

    const brandName = extractBrandNameFromBrief(brief);
    const brandColors = extractColorTokensFromBrief(brief);
    const existingMasterBrand =
      typeof existing.masters?.brandName === "string"
        ? existing.masters.brandName.trim()
        : "";
    // Brief extraction may enrich masters when no brand identity exists yet.
    // It must not overwrite an already-selected / persisted brand name.
    const start = resolveCdfPostBriefStart({
      config,
      selection: {
        platform: req.platform,
        format: req.format,
        subtype: req.subtype,
        category: req.category,
      },
    });
    const phase = start.phase ?? config.phases[start.phaseIndex]!;
    const activeCheck = assertActiveCanonicalPhase(config.serviceId, phase.id);
    if (!activeCheck.ok) return activeCheck;

    const next = bumpSessionVersion(existing, {
      brief,
      productMode: req.productMode ?? existing.productMode,
      projectId: req.projectId ?? existing.projectId,
      approved: [
        ...existing.approved.filter(
          (a) => !start.autoApproved.some((x) => x.phaseId === a.phaseId),
        ),
        ...start.autoApproved,
      ],
      masters: {
        ...existing.masters,
        ...(brandName && !existingMasterBrand ? { brandName } : {}),
        ...(brandColors.length ? { brandColors } : {}),
        ...start.mastersPatch,
        ...(typeof req.subtype === "string" && req.subtype.trim()
          ? { productSubtype: req.subtype.trim() }
          : {}),
        ...(typeof req.platform === "string" && req.platform.trim()
          ? { productPlatform: req.platform.trim() }
          : {}),
      },
      ...(activeBriefId ? { activeBriefId } : {}),
      ...(activeBriefVersion != null ? { activeBriefVersion } : {}),
      ...advanceToPhase(existing, config, start.phaseIndex),
      lastRequestKey: fingerprint,
    });
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: resolveAuthoritativeNextWork(config, next),
      meta: metaBase,
    });
  }

  if (req.action === "reopen_route_selection") {
    const stopped = currentPhase(config, existing);
    const routesIndex = existing.phaseIndex - 1;
    const routesPhase = routesIndex >= 0 ? config.phases[routesIndex] : undefined;
    const routesSelected = routesPhase
      ? existing.selected.some((s) => s.phaseId === routesPhase.id)
      : false;
    if (
      !stopped ||
      !routesPhase ||
      routesPhase.type !== "routes" ||
      !routesSelected ||
      (req.phaseId?.trim() && req.phaseId.trim() !== routesPhase.id) ||
      config.phases
        .slice(existing.phaseIndex)
        .some((p) => isApproved(existing, p.id))
    ) {
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          "reopen_route_selection is only valid right after a route selection whose next step is not approved",
          { phaseId: existing.phaseId },
        ),
      );
    }
    const next = bumpSessionVersion(existing, {
      selected: existing.selected.filter((s) => s.phaseId !== routesPhase.id),
      ...(existing.selectedArtifacts
        ? {
            selectedArtifacts: existing.selectedArtifacts.filter(
              (r) => r.phaseId !== routesPhase.id,
            ),
          }
        : {}),
      ...(existing.generatedArtifacts
        ? {
            generatedArtifacts: existing.generatedArtifacts.filter(
              (r) => r.phaseId !== stopped.id,
            ),
          }
        : {}),
      ...advanceToPhase(existing, config, routesIndex),
      lastRequestKey: fingerprint,
    });
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: resolveAuthoritativeNextWork(config, next),
      meta: metaBase,
    });
  }

  const phase = currentPhase(config, existing);
  if (!phase && req.action !== "handoff_studio") {
    return failure(cdfError("INVALID_PHASE", "No active CDF phase"));
  }
  if (phase) {
    const activeCheck = assertActiveCanonicalPhase(config.serviceId, phase.id);
    if (!activeCheck.ok) return activeCheck;
  }
  const canonical = phase
    ? canonicalPhaseFor(existing.serviceId, phase.id)
    : undefined;

  if (phase && canonical && req.action !== "handoff_studio") {
    const mapped = mapLegacyActionToCanonical(req.action);
    const allowed = new Set(canonical.allowedActions);
    if (phase.type === "routes") allowed.add("select");
    // Visual generation phases: continuation is always allowed (≠ approve).
    if (
      phase.type === "output" ||
      phase.type === "mockup" ||
      phase.type === "multi-output"
    ) {
      allowed.add("select");
    }
    if (
      mapped !== "start" &&
      mapped !== "submit_brief" &&
      !allowed.has(mapped)
    ) {
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          `Action "${req.action}" is not allowed on phase "${phase.id}"`,
          { allowedActions: [...allowed] },
        ),
      );
    }
  }

  if (req.action === "select_route") {
    if (!phase || phase.type !== "routes") {
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          "select_route is only valid on routes phases",
        ),
      );
    }
    const dep = assertDependencies(existing, phase, canonical);
    if (!dep.ok) return dep;
    let idx = req.routeIndex;
    const choiceId = req.choiceId?.trim() || undefined;
    const configRouteCount = phase.routes?.length ?? 0;
    const maxIdx = Math.max(configRouteCount, 8) - 1;
    if (
      (idx == null || !Number.isInteger(idx) || idx < 0 || idx > maxIdx) &&
      !choiceId
    ) {
      return failure(
        cdfError("INVALID_SELECTION", "Valid routeIndex is required"),
      );
    }

    // Framework-wide: when canonical ArtifactVersion refs exist, select_route
    // must carry exact artifact identity — never routeIndex / executionId alone.
    const enforceExactIdentity = selectRequiresExactArtifactIdentity(
      existing,
      canonical,
    );
    let selectArtifactId = req.artifactId;
    let selectArtifactVersion = req.artifactVersion;
    let selectArtifactKey = req.artifactKey;
    // A select may only pin an artifact generated for THIS phase. A stale card
    // from an earlier phase must not select (or re-transition) that artifact.
    // materializeDerivedOnSelect phases legitimately reference an upstream pin.
    const derivesOnSelect = Boolean(
      resolveCdfPhaseExecutionContract({
        serviceId: existing.serviceId,
        phaseId: phase.id,
        phase: canonical ?? null,
      })?.materializeDerivedOnSelect,
    );
    if (
      !derivesOnSelect &&
      selectArtifactId &&
      isCdfCanonicalArtifactId(selectArtifactId)
    ) {
      let pinnedPhaseId: string | undefined;
      try {
        pinnedPhaseId = getArtifact(selectArtifactId, {
          organizationId: existing.organizationId,
          projectId: existing.projectId,
        }).phaseId;
      } catch {
        pinnedPhaseId = undefined;
      }
      if (pinnedPhaseId !== phase.id) {
        logTransition({
          sessionId: existing.sessionId,
          serviceId: existing.serviceId,
          action: "select_route",
          previousPhase: phase.id,
          previousVersion: existing.sessionVersion,
          result: "error",
          errorCode: "INVALID_SELECTION",
          requestKey: fingerprint,
        });
        return failure(
          cdfError(
            "INVALID_SELECTION",
            "That option belongs to an earlier step. Choose from the current options.",
            {
              reason: "artifact_not_in_current_phase",
              phaseId: phase.id,
              artifactId: selectArtifactId,
              artifactVersion: selectArtifactVersion ?? null,
              artifactPhaseId: pinnedPhaseId ?? null,
            },
          ),
        );
      }
    }
    if (enforceExactIdentity) {
      const phasePins = (existing.generatedArtifacts ?? []).filter(
        (r) => r.phaseId === phase.id,
      );
      const resolveExactPin = ():
        | (typeof phasePins)[number]
        | undefined => {
        // 1. Exact X@V from the request (fanout-scoped when target present)
        if (
          selectArtifactId &&
          selectArtifactVersion != null &&
          Number.isInteger(selectArtifactVersion) &&
          selectArtifactVersion >= 1
        ) {
          const fanoutOnExact =
            typeof (req as { generationFanoutTargetId?: unknown })
              .generationFanoutTargetId === "string"
              ? String(
                  (req as { generationFanoutTargetId: string })
                    .generationFanoutTargetId,
                ).trim()
              : "";
          return phasePins.find((r) => {
            if (
              r.artifactId !== selectArtifactId ||
              r.version !== selectArtifactVersion ||
              !isCdfCanonicalArtifactId(r.artifactId)
            ) {
              return false;
            }
            if (fanoutOnExact) {
              return r.generationFanoutTargetId === fanoutOnExact;
            }
            const phaseHasFanout = phasePins.some((p) =>
              Boolean(p.generationFanoutTargetId?.trim()),
            );
            // C6: multi-leaf phase without targetId — refuse first-match X@V alone
            // only when the matched pin is fanout-scoped (siblings share key).
            if (phaseHasFanout && r.generationFanoutTargetId) {
              return false;
            }
            return true;
          });
        }
        // 2. Disambiguate by artifactKey + optional fanout target
        let candidates = phasePins.filter((r) =>
          isCdfCanonicalArtifactId(r.artifactId),
        );
        if (selectArtifactKey) {
          candidates = candidates.filter(
            (r) => r.artifactKey === selectArtifactKey,
          );
        }
        const fanoutTarget =
          typeof (req as { generationFanoutTargetId?: unknown })
            .generationFanoutTargetId === "string"
            ? String(
                (req as { generationFanoutTargetId: string })
                  .generationFanoutTargetId,
              ).trim()
            : "";
        const hasFanoutPins = candidates.some((r) =>
          Boolean(r.generationFanoutTargetId?.trim()),
        );
        // C6: fanout-scoped phase pins require an explicit leaf target — never
        // fall back to first non-fanout / global match.
        if (hasFanoutPins && !fanoutTarget) {
          return undefined;
        }
        if (fanoutTarget) {
          candidates = candidates.filter(
            (r) => r.generationFanoutTargetId === fanoutTarget,
          );
        } else {
          // Non-fanout select: ignore fanout-scoped pins
          candidates = candidates.filter((r) => !r.generationFanoutTargetId);
        }
        // Fail closed on ambiguity — never first-match.
        if (candidates.length === 1) return candidates[0];
        return undefined;
      };

      const generatedPin = resolveExactPin();
      if (
        (!selectArtifactId || selectArtifactVersion == null) &&
        generatedPin &&
        isCdfCanonicalArtifactId(generatedPin.artifactId)
      ) {
        selectArtifactId = generatedPin.artifactId;
        selectArtifactVersion = generatedPin.version;
        selectArtifactKey = selectArtifactKey ?? generatedPin.artifactKey;
      } else if (
        selectArtifactId &&
        selectArtifactVersion != null &&
        !generatedPin &&
        phasePins.length > 0
      ) {
        // Requested X@V is not among session pins for this phase — fail closed.
        selectArtifactId = undefined;
        selectArtifactVersion = undefined;
      }
      if (
        !selectArtifactId ||
        selectArtifactVersion == null ||
        !Number.isInteger(selectArtifactVersion) ||
        selectArtifactVersion < 1 ||
        !isCdfCanonicalArtifactId(selectArtifactId)
      ) {
        logTransition({
          sessionId: existing.sessionId,
          serviceId: existing.serviceId,
          action: "select_route",
          previousPhase: phase.id,
          previousVersion: existing.sessionVersion,
          result: "error",
          errorCode: "INVALID_SELECTION",
          requestKey: fingerprint,
        });
        try {
          console.info(
            JSON.stringify({
              scope: "cdf.state_machine",
              event: "select_route_missing_exact_x_v",
              sessionId: existing.sessionId,
              phaseId: phase.id,
              artifactKey: selectArtifactKey ?? null,
              selectedRouteIndex: idx,
              resolvedArtifactId: selectArtifactId ?? null,
              resolvedArtifactVersion: selectArtifactVersion ?? null,
              generatedArtifactsCount: existing.generatedArtifacts?.length ?? 0,
              hasGeneratedPinForPhase: Boolean(
                existing.generatedArtifacts?.some((r) => r.phaseId === phase.id),
              ),
              ts: new Date().toISOString(),
            }),
          );
        } catch {
          // ignore
        }
        return failure(
          cdfError(
            "INVALID_SELECTION",
            "Canonical CDF select_route requires artifactId and artifactVersion (exact pin)",
            {
              phaseId: phase.id,
              sessionId: existing.sessionId,
              sessionVersion: existing.sessionVersion,
              missingArtifactId: !selectArtifactId,
              missingArtifactVersion: selectArtifactVersion == null,
              hasCanonicalRefs: sessionHasCanonicalArtifactRefs(existing),
            },
          ),
        );
      }
      try {
        console.info(
          JSON.stringify({
            scope: "cdf.state_machine",
            event: "select_route_canonical",
            sessionId: existing.sessionId,
            sessionVersion: existing.sessionVersion,
            phaseId: phase.id,
            artifactKey: selectArtifactKey,
            artifactId: selectArtifactId,
            artifactVersion: selectArtifactVersion,
            routeIndex: idx,
            choiceId: choiceId ?? null,
            ts: nowIso(),
          }),
        );
      } catch {
        // ignore
      }

      // Validate choice against the exact parent ArtifactVersion — never clamp,
      // never reinterpret an invalid index, never fall back to latest.
      try {
        const versionRec = getArtifactVersion(
          selectArtifactId,
          selectArtifactVersion,
          {
            organizationId: existing.organizationId,
            projectId: existing.projectId,
          },
        );
        const extracted = extractChoiceArrayFromArtifactData(versionRec.data);
        if (extracted) {
          if (choiceId) {
            const byId = extracted.items.findIndex((item) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) {
                return false;
              }
              const r = item as Record<string, unknown>;
              const id = r.routeId ?? r.id ?? r.choiceId;
              return typeof id === "string" && id.trim() === choiceId;
            });
            if (byId < 0) {
              return failure(
                cdfError(
                  "INVALID_SELECTION",
                  `choiceId "${choiceId}" not found in ${selectArtifactKey ?? "artifact"} (${extracted.items.length} choices)`,
                  {
                    choiceId,
                    choiceCount: extracted.items.length,
                    artifactId: selectArtifactId,
                    artifactVersion: selectArtifactVersion,
                  },
                ),
              );
            }
            idx = byId;
          } else if (
            idx == null ||
            !Number.isInteger(idx) ||
            idx < 0 ||
            idx >= extracted.items.length
          ) {
            return failure(
              cdfError(
                "INVALID_SELECTION",
                `selectedRouteIndex ${idx} out of range for ${selectArtifactKey ?? "artifact"} (${extracted.items.length} choices)`,
                {
                  routeIndex: idx,
                  choiceCount: extracted.items.length,
                  artifactId: selectArtifactId,
                  artifactVersion: selectArtifactVersion,
                },
              ),
            );
          }
        } else if (
          idx == null ||
          !Number.isInteger(idx) ||
          idx < 0 ||
          idx > maxIdx
        ) {
          return failure(
            cdfError("INVALID_SELECTION", "Valid routeIndex is required"),
          );
        }
      } catch (err) {
        if (err instanceof CdfArtifactError) {
          return failure(
            cdfError("INVALID_SELECTION", err.message, {
              artifactCode: err.artifactCode,
            }),
          );
        }
        throw err;
      }
    } else if (
      idx == null ||
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx > maxIdx
    ) {
      return failure(
        cdfError("INVALID_SELECTION", "Valid routeIndex is required"),
      );
    }

    const route = phase.routes?.[idx];
    const inputRequirement = resolveCdfRouteInputRequirement({
      serviceId: existing.serviceId,
      phaseId: phase.id,
      routeIndex: idx,
      routeLabel: req.routeLabel,
      routeTitle: req.routeTitle,
    });
    const routeInput = req.routeInput?.trim();
    if (inputRequirement && !routeInput) {
      return failure(
        cdfError(
          "INVALID_SELECTION",
          `This option needs your input before it can continue. ${inputRequirement.prompt}`,
          { routeIndex: idx, inputRequired: inputRequirement.kind },
        ),
      );
    }
    const label =
      req.routeLabel?.trim() || route?.label || `Route ${idx + 1}`;
    const title = req.routeTitle?.trim() || route?.title || label;
    const baseDesc = req.routeDesc?.trim() || route?.desc;
    const desc =
      inputRequirement && routeInput
        ? composeCdfRouteDescWithInput(baseDesc, inputRequirement, routeInput)
        : baseDesc;
    const selected: CdfSelectedPhase = {
      phaseId: phase.id,
      selectedAt: nowIso(),
      selectedRouteIndex: idx,
      selectedRouteLabel: label,
      ...(choiceId ? { selectedChoiceId: choiceId } : {}),
      routeTitle: title,
      ...(desc ? { routeDesc: desc } : {}),
      ...(selectArtifactId ? { artifactId: selectArtifactId } : {}),
      ...(selectArtifactVersion != null
        ? { artifactVersion: selectArtifactVersion }
        : {}),
      ...(req.executionId ? { executionId: req.executionId } : {}),
    };
    // Never dual-write select → approved. Selected ≠ approved (framework invariant).
    // Downstream deps declare requiredRole; select-only upstreams use "selected".
    let next = bumpSessionVersion(existing, {
      selected: [
        ...existing.selected.filter((s) => s.phaseId !== phase.id),
        selected,
      ],
      masters: {
        ...existing.masters,
        routeId: label,
        routeTitle: title,
        ...(desc ? { routeDesc: desc } : {}),
      },
      lastRequestKey: fingerprint,
    });

    // M3A: selection updates Artifact Engine selected state only (not approved).
    try {
      next = applyArtifactEngineOnSelect({
        session: next,
        phaseId: phase.id,
        artifactId: selectArtifactId,
        artifactVersion: selectArtifactVersion,
        artifactKey: selectArtifactKey,
        organizationId: existing.organizationId,
        projectId: existing.projectId,
      });
    } catch (err) {
      if (err instanceof CdfArtifactError) {
        return failure(
          cdfError("INVALID_SELECTION", err.message, {
            artifactCode: err.artifactCode,
          }),
        );
      }
      throw err;
    }

    // Declarative: selection.materializeDerivedOnSelect → derive ArtifactVersion.
    // Dispatch by targetArtifactKey only — never serviceId/phaseId.
    const selectContract = resolveCdfPhaseExecutionContract({
      serviceId: existing.serviceId,
      phaseId: phase.id,
      phase: canonical ?? null,
    });
    const materializeSpec = selectContract?.materializeDerivedOnSelect;
    if (materializeSpec?.targetArtifactKey) {
      try {
        const { materializeDerivedArtifactOnSelect } = require("../selection/materialize-derived-on-select") as typeof import("../selection/materialize-derived-on-select");
        const materialized = materializeDerivedArtifactOnSelect({
          targetArtifactKey: materializeSpec.targetArtifactKey,
          session: next,
          phaseId: phase.id,
          routeIndex: idx,
          routeTitle: title,
          routeDesc: desc,
          routeLabel: label,
          artifactId: req.artifactId,
          artifactVersion: req.artifactVersion,
          organizationId: existing.organizationId,
          projectId: existing.projectId,
          workspaceId: existing.workspaceId,
          userId: existing.userId,
        });
        next = materialized.session;
        next = {
          ...next,
          masters: {
            ...next.masters,
            masterArtifactId: materialized.derivedArtifactId,
          },
        };
      } catch (err) {
        return failure(
          cdfError(
            "INVALID_SELECTION",
            err instanceof Error
              ? err.message
              : "Failed to materialize derived artifact from selection",
          ),
        );
      }
    }

    try {
      const selCap = captureSourceAndResolveSync({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        projectId: existing.projectId,
        userId: existing.userId,
        type: "selection",
        rawContent: [label, title, desc].filter(Boolean).join(" — "),
        source: "cdf_select_route",
        metadata: {
          phaseId: phase.id,
          selectedRouteIndex: idx,
          selectedRouteLabel: label,
          routeTitle: title,
          semantic: "selection",
        },
      });
      // Legacy dual-write: approved[] row is compatibility only — not canonical approval.
      captureSourceAndResolveSync({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        projectId: existing.projectId,
        userId: existing.userId,
        type: "legacy_select_compat",
        rawContent: `legacy_select_compat:${phase.id}`,
        source: "cdf_select_route_legacy_approval_row",
        metadata: {
          phaseId: phase.id,
          semantic: "legacy_compat_not_canonical_approval",
        },
      });
      next = {
        ...next,
        activeBriefId: selCap.brief.activeBriefId,
        activeBriefVersion: selCap.brief.version,
      };
      const latest = getLatestActiveBrief(existing.sessionId);
      if (latest) {
        next = {
          ...next,
          activeBriefId: latest.activeBriefId,
          activeBriefVersion: latest.version,
        };
      }
    } catch {
      // Selection transition still proceeds; requirement bag best-effort
    }

    const nextIndex = existing.phaseIndex + 1;
    if (nextIndex >= config.phases.length) {
      next = { ...next, status: "completed" };
      return success({
        kind: "mutate",
        expectedVersion,
        next,
        config,
        nextWork: { kind: "none" },
        meta: metaBase,
      });
    }
    const nextPhase = config.phases[nextIndex]!;
    const nextActive = assertActiveCanonicalPhase(
      config.serviceId,
      nextPhase.id,
    );
    if (!nextActive.ok) return nextActive;
    next = { ...next, ...advanceToPhase(next, config, nextIndex) };
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: resolveAuthoritativeNextWork(config, next),
      meta: metaBase,
    });
  }


  if (req.action === "select_generation_for_continuation") {
    if (
      !phase ||
      (phase.type !== "output" &&
        phase.type !== "mockup" &&
        phase.type !== "multi-output")
    ) {
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          "select_generation_for_continuation is only valid on visual generation phases",
        ),
      );
    }
    const dep = assertDependencies(existing, phase, canonical);
    if (!dep.ok) return dep;

    const executionId = req.executionId?.trim() || "";
    const visualArtifactId =
      req.visualArtifactId?.trim() || req.artifactId?.trim() || "";
    if (!executionId) {
      return failure(
        cdfError(
          "INVALID_SELECTION",
          "Generation continuation requires exact executionId",
        ),
      );
    }
    if (!visualArtifactId) {
      return failure(
        cdfError(
          "INVALID_SELECTION",
          "Generation continuation requires a resolvable visual artifact reference",
        ),
      );
    }

    const isCanonicalVisual = isCdfCanonicalArtifactId(visualArtifactId);
    const isRawVisual =
      visualArtifactId.startsWith("art_") && !isCanonicalVisual;
    if (!isCanonicalVisual && !isRawVisual) {
      return failure(
        cdfError(
          "INVALID_SELECTION",
          "visualArtifactId must be raw art_* or canonical cdfart_*",
        ),
      );
    }
    if (isCanonicalVisual) {
      const ver = req.visualArtifactVersion ?? req.artifactVersion;
      if (ver == null || !Number.isInteger(ver)) {
        return failure(
          cdfError(
            "INVALID_SELECTION",
            "Canonical visual continuation requires exact artifactVersion",
          ),
        );
      }
    }

    const eligibility = req.presentationEligibilityStatus?.trim();
    if (
      eligibility === "FAILED" ||
      eligibility === "PENDING" ||
      eligibility === "REJECTED" ||
      eligibility === "UNVERIFIABLE"
    ) {
      return failure(
        cdfError(
          "INVALID_SELECTION",
          `Cannot continue from presentation eligibility ${eligibility}`,
        ),
      );
    }

    // Upstream canonical direction remains authoritative (routes X@V).
    // Prefer the latest selected canonical pin — not the earliest (e.g. dieline).
    const selectedCanonical = [...existing.selected]
      .reverse()
      .find(
        (s) =>
          s.phaseId !== phase.id &&
          s.artifactId &&
          isCdfCanonicalArtifactId(s.artifactId),
      );
    const upstreamSelected =
      selectedCanonical || existing.selected[existing.selected.length - 1];
    const upstreamPin =
      [...(existing.selectedArtifacts ?? [])]
        .reverse()
        .find(
          (r) =>
            r.phaseId !== phase.id && isCdfCanonicalArtifactId(r.artifactId),
        ) || undefined;

    const visualVersion =
      req.visualArtifactVersion ?? req.artifactVersion ?? undefined;
    const continuation: CdfGenerationContinuationSelection = {
      selectionKind: "generation_continuation",
      sourcePhaseId: phase.id,
      ...(req.artifactKey?.trim()
        ? { sourceArtifactKey: req.artifactKey.trim() }
        : canonical?.artifactKey
          ? { sourceArtifactKey: canonical.artifactKey }
          : {}),
      selectedAt: nowIso(),
      executionId,
      visualArtifactId,
      ...(isCanonicalVisual && visualVersion != null
        ? { visualArtifactVersion: visualVersion }
        : {}),
      isDiagnosticRaw: isRawVisual,
      ...(req.generationFanoutGroupId?.trim()
        ? { generationFanoutGroupId: req.generationFanoutGroupId.trim() }
        : {}),
      ...(req.generationFanoutTargetId?.trim()
        ? { generationFanoutTargetId: req.generationFanoutTargetId.trim() }
        : {}),
      ...(req.providerId?.trim() ? { providerId: req.providerId.trim() } : {}),
      ...(req.modelId?.trim() ? { modelId: req.modelId.trim() } : {}),
      ...(eligibility ? { presentationEligibilityStatus: eligibility } : {}),
      ...(upstreamPin
        ? {
            upstreamArtifactId: upstreamPin.artifactId,
            upstreamArtifactVersion: upstreamPin.version,
          }
        : upstreamSelected?.artifactId &&
            isCdfCanonicalArtifactId(upstreamSelected.artifactId)
          ? {
              upstreamArtifactId: upstreamSelected.artifactId,
              ...(upstreamSelected.artifactVersion != null
                ? { upstreamArtifactVersion: upstreamSelected.artifactVersion }
                : {}),
            }
          : {}),
      ...(upstreamSelected?.selectedChoiceId
        ? { upstreamChoiceId: upstreamSelected.selectedChoiceId }
        : {}),
      ...(upstreamSelected?.selectedRouteIndex != null
        ? { upstreamRouteIndex: upstreamSelected.selectedRouteIndex }
        : {}),
    };

    // Observational selected[] note for continuity — NEVER pin art_* as selectedArtifacts.
    const selectedNote: CdfSelectedPhase = {
      phaseId: phase.id,
      selectedAt: continuation.selectedAt,
      executionId,
      ...(isCanonicalVisual
        ? {
            artifactId: visualArtifactId,
            ...(visualVersion != null ? { artifactVersion: visualVersion } : {}),
          }
        : {}),
      ...(req.routeTitle?.trim() ? { routeTitle: req.routeTitle.trim() } : {}),
      ...(req.routeLabel?.trim()
        ? { selectedRouteLabel: req.routeLabel.trim() }
        : {}),
      ...(req.routeDesc?.trim() ? { routeDesc: req.routeDesc.trim() } : {}),
    };

    const priorContinuations = (existing.generationContinuations ?? []).filter(
      (c) => c.sourcePhaseId !== phase.id,
    );

    let next = bumpSessionVersion(existing, {
      selected: [
        ...existing.selected.filter((s) => s.phaseId !== phase.id),
        selectedNote,
      ],
      generationContinuations: [...priorContinuations, continuation],
      masters: {
        ...existing.masters,
        // Keep masterExecutionId as the selected leaf for downstream parent linkage.
        masterExecutionId: executionId,
        // Never overwrite masterArtifactId with raw art_*.
        ...(isCanonicalVisual
          ? { masterArtifactId: visualArtifactId }
          : {}),
      },
      lastRequestKey: fingerprint,
    });

    // If AVAILABLE cdfart_*: optionally pin as selected (not approved).
    if (isCanonicalVisual && visualVersion != null) {
      try {
        next = applyArtifactEngineOnSelect({
          session: next,
          phaseId: phase.id,
          artifactId: visualArtifactId,
          artifactVersion: visualVersion,
          artifactKey: req.artifactKey,
          organizationId: existing.organizationId,
          projectId: existing.projectId,
        });
      } catch (err) {
        if (err instanceof CdfArtifactError) {
          return failure(
            cdfError("INVALID_SELECTION", err.message, {
              artifactCode: err.artifactCode,
            }),
          );
        }
        throw err;
      }
    }

    try {
      console.info(
        JSON.stringify({
          scope: "cdf.state_machine",
          event: "select_generation_for_continuation",
          sessionId: existing.sessionId,
          phaseId: phase.id,
          executionId,
          visualArtifactId,
          isDiagnosticRaw: isRawVisual,
          generationFanoutGroupId: continuation.generationFanoutGroupId,
          generationFanoutTargetId: continuation.generationFanoutTargetId,
          upstreamArtifactId: continuation.upstreamArtifactId,
          upstreamArtifactVersion: continuation.upstreamArtifactVersion,
          ts: nowIso(),
        }),
      );
    } catch {
      // ignore
    }

    const nextIndex = existing.phaseIndex + 1;
    if (nextIndex >= config.phases.length) {
      next = { ...next, status: "completed" };
      return success({
        kind: "mutate",
        expectedVersion,
        next,
        config,
        nextWork: { kind: "none" },
        meta: metaBase,
      });
    }
    const nextPhase = config.phases[nextIndex]!;
    const nextActive = assertActiveCanonicalPhase(
      config.serviceId,
      nextPhase.id,
    );
    if (!nextActive.ok) return nextActive;
    next = { ...next, ...advanceToPhase(next, config, nextIndex) };
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: resolveAuthoritativeNextWork(config, next),
      meta: metaBase,
    });
  }

  if (req.action === "approve") {
    if (
      !phase ||
      (phase.type !== "text-approval" &&
        phase.type !== "output" &&
        phase.type !== "mockup" &&
        phase.type !== "multi-output")
    ) {
      return failure(
        cdfError("ACTION_NOT_ALLOWED", "approve is not valid for this phase"),
      );
    }
    if (canonical && canonical.approval.mode === "not_applicable") {
      return failure(
        cdfError(
          "APPROVAL_INVALID",
          `Phase "${phase.id}" does not accept approval`,
        ),
      );
    }

    const phaseContract = resolveCdfPhaseExecutionContract({
      serviceId: existing.serviceId,
      phaseId: phase.id,
    });
    if (phaseContract) {
      const targetOk = isValidCdfPhaseExecutionTarget({
        contract: phaseContract,
        executionId: req.executionId,
        artifactKey: req.artifactKey,
      });
      if (!targetOk.ok) {
        return failure(
          cdfError("APPROVAL_INVALID", targetOk.reason, {
            reason: "CDF_PHASE_EXECUTION_LINEAGE_INVALID",
            artifactKey: phaseContract.artifactKey,
          }),
        );
      }
    }

    const nextIndexPreview = existing.phaseIndex + 1;
    const nextPhaseIdPreview =
      nextIndexPreview < config.phases.length
        ? config.phases[nextIndexPreview]?.id
        : null;

    // Upstream dependencies first (exact role + X@V) — then current-phase
    // canonical completion. Both must pass before any sessionVersion bump.
    const dep = assertDependencies(existing, phase, canonical);
    if (!dep.ok) return dep;

    // Generic approval precondition: canonical completion must exist before
    // any sessionVersion bump or phase advance.
    const completion = resolvePhaseCompletionForApproval({
      session: existing,
      phaseId: phase.id,
      serviceId: existing.serviceId,
      phase: canonical,
      contract: phaseContract,
      requestArtifactId: req.artifactId,
      requestArtifactVersion: req.artifactVersion,
      requestArtifactKey: req.artifactKey,
      ...(req.generationFanoutTargetId?.trim()
        ? {
            requestGenerationFanoutTargetId:
              req.generationFanoutTargetId.trim(),
          }
        : {}),
      requestPresentationEligibility: req.presentationEligibilityStatus,
    });
    logApprovalPrecondition({
      sessionId: existing.sessionId,
      sessionVersion: existing.sessionVersion,
      phaseId: phase.id,
      nextPhaseId: nextPhaseIdPreview,
      resolution: completion,
      requestArtifactId: req.artifactId ?? null,
      requestArtifactVersion: req.artifactVersion ?? null,
      requestArtifactKey: req.artifactKey ?? null,
      requestGenerationFanoutTargetId: req.generationFanoutTargetId ?? null,
    });
    if (!completion.transitionAllowed) {
      return failure(
        cdfError(
          "APPROVAL_INVALID",
          completion.message ??
            `Phase "${phase.id}" is not complete for approval`,
          {
            reason: completion.failureCode ?? "CDF_CANONICAL_COMPLETION_REQUIRED",
            completionStatus: completion.completionStatus,
            selectionStatus: completion.selectionStatus,
            approvalStatus: completion.approvalStatus,
            durabilityStatus: completion.durabilityStatus,
            requiredArtifactKey: completion.requiredArtifactKey,
            requiredRole: completion.requiredRole,
            requiredArtifactId: completion.requiredArtifactId,
            requiredArtifactVersion: completion.requiredArtifactVersion,
            transitionAllowed: false,
          },
        ),
      );
    }

    // Existing CREATIVE_QA / governance release gate: do not advance when blocked.
    if (phaseContract?.requiresCanonicalCreate && creativeQaBlocksRelease()) {
      const gate = getExecutionReleaseGate(req.executionId);
      if (gate?.blocked) {
        return failure(
          cdfError(
            "APPROVAL_INVALID",
            gate.reason ??
              "Cannot approve — creative QA / contract release gate blocked this output",
            {
              reason: "CDF_QUALITY_RELEASE_BLOCKED",
              creativeScore: gate.creativeScore,
            },
          ),
        );
      }
    }

    const approved: CdfApprovedPhase = {
      phaseId: phase.id,
      approvedAt: nowIso(),
      artifactId: req.artifactId,
      ...(req.artifactVersion != null
        ? { artifactVersion: req.artifactVersion }
        : {}),
      executionId: req.executionId,
      ...(req.note?.trim() ? { note: req.note.trim() } : {}),
    };
    let next = bumpSessionVersion(existing, {
      approved: [
        ...existing.approved.filter((a) => a.phaseId !== phase.id),
        approved,
      ],
      masters: {
        ...existing.masters,
        masterArtifactId: req.artifactId ?? existing.masters.masterArtifactId,
        masterExecutionId:
          req.executionId ?? existing.masters.masterExecutionId,
      },
      lastRequestKey: fingerprint,
    });

    // M3A: approval pins exact artifact version in Artifact Engine + session refs.
    try {
      next = applyArtifactEngineOnApprove({
        session: next,
        phaseId: phase.id,
        artifactId: req.artifactId,
        artifactVersion: req.artifactVersion,
        artifactKey: req.artifactKey ?? completion.requiredArtifactKey,
        organizationId: existing.organizationId,
        projectId: existing.projectId,
        ...(req.generationFanoutTargetId?.trim()
          ? {
              generationFanoutTargetId: req.generationFanoutTargetId.trim(),
            }
          : {}),
        ...(req.generationFanoutGroupId?.trim()
          ? {
              generationFanoutGroupId: req.generationFanoutGroupId.trim(),
            }
          : {}),
        ...(req.executionId?.trim()
          ? { generationExecutionId: req.executionId.trim() }
          : {}),
      });
      if (req.artifactId && req.artifactVersion != null) {
        try {
          console.info(
            JSON.stringify({
              scope: "cdf.state_machine",
              event: "approve_route_canonical",
              sessionId: existing.sessionId,
              sessionVersion: next.sessionVersion,
              phaseId: phase.id,
              artifactKey: req.artifactKey ?? completion.requiredArtifactKey,
              artifactId: req.artifactId,
              artifactVersion: req.artifactVersion,
              ...(req.generationFanoutTargetId?.trim()
                ? {
                    generationFanoutTargetId:
                      req.generationFanoutTargetId.trim(),
                  }
                : {}),
              ts: nowIso(),
            }),
          );
        } catch {
          // ignore
        }
      }
    } catch (err) {
      if (err instanceof CdfArtifactError) {
        return failure(
          cdfError("APPROVAL_INVALID", err.message, {
            artifactCode: err.artifactCode,
          }),
        );
      }
      throw err;
    }

    try {
      const cap = captureSourceAndResolveSync({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        projectId: existing.projectId,
        userId: existing.userId,
        type: "approval",
        rawContent: approved.note?.trim() || `Approved phase ${phase.id}`,
        source: "cdf_approve",
        metadata: {
          phaseId: phase.id,
          artifactId: approved.artifactId,
          artifactVersion: approved.artifactVersion,
          executionId: approved.executionId,
          note: approved.note,
          semantic: "approval",
        },
      });
      next = {
        ...next,
        activeBriefId: cap.brief.activeBriefId,
        activeBriefVersion: cap.brief.version,
      };
    } catch {
      // best-effort
    }
    const advance = resolveVideoAdvanceAfterApproval({
      service: "video",
      subtype: next.masters?.productSubtype ?? existing.masters?.productSubtype,
      phases: config.phases,
      approvedPhaseId: phase.id,
      currentPhaseIndex: existing.phaseIndex,
    });
    const nextIndex = advance.nextPhaseIndex;
    if (advance.skippedAutoApproved.length > 0) {
      const nowIso = new Date().toISOString();
      next = {
        ...next,
        approved: [
          ...next.approved.filter(
            (a) =>
              !advance.skippedAutoApproved.some((s) => s.phaseId === a.phaseId),
          ),
          ...advance.skippedAutoApproved.map((s) => ({
            phaseId: s.phaseId,
            approvedAt: nowIso,
            note: s.note,
          })),
        ],
      };
    }
    if (nextIndex >= config.phases.length) {
      next = { ...next, status: "completed" };
      return success({
        kind: "mutate",
        expectedVersion,
        next,
        config,
        nextWork: { kind: "none" },
        meta: metaBase,
      });
    }
    const nextPhase = config.phases[nextIndex]!;
    const nextActive = assertActiveCanonicalPhase(
      config.serviceId,
      nextPhase.id,
    );
    if (!nextActive.ok) return nextActive;
    next = { ...next, ...advanceToPhase(next, config, nextIndex) };
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: resolveAuthoritativeNextWork(config, next),
      meta: metaBase,
    });
  }

  if (req.action === "refine") {
    if (
      !phase ||
      (phase.type !== "text-approval" &&
        phase.type !== "output" &&
        phase.type !== "mockup" &&
        phase.type !== "multi-output")
    ) {
      return failure(
        cdfError("REFINEMENT_NOT_ALLOWED", "refine is not valid for this phase"),
      );
    }
    if (canonical && !canonical.refinement.enabled) {
      return failure(
        cdfError(
          "REFINEMENT_NOT_ALLOWED",
          `Phase "${phase.id}" does not support refinement`,
        ),
      );
    }
    const prompt = (req.refinePrompt ?? "").trim();
    if (!prompt) {
      return failure(
        cdfError("INVALID_ACTION_PAYLOAD", "refinePrompt is required"),
      );
    }

    // M6 targeted path: exact artifactId + artifactVersion → patch, never full-deck regen
    const targeted =
      typeof req.artifactId === "string" &&
      req.artifactId.startsWith("cdfart_") &&
      req.artifactVersion != null &&
      Number.isInteger(req.artifactVersion);

    if (targeted) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const refinement = require("../refinement") as typeof import("../refinement");
      try {
        const result = refinement.applyTargetedRefinement({
          projectId: existing.projectId,
          organizationId: existing.organizationId,
          workspaceId: existing.workspaceId,
          serviceId: existing.serviceId,
          phaseId: phase.id,
          sessionId: existing.sessionId,
          userId: existing.userId,
          rawInstruction: prompt,
          artifactId: req.artifactId!,
          artifactVersion: req.artifactVersion!,
          briefVersion: existing.activeBriefVersion,
          contextId: req.contextId,
          contextHash: req.contextHash,
          expectedSessionVersion: expectedVersion,
          requestId: req.requestId,
        });

        if (result.status === "requires_clarification") {
          return success({
            kind: "mutate",
            expectedVersion,
            next: bumpSessionVersion(existing, {
              lastRefinePrompt: prompt,
              lastRequestKey: fingerprint,
              ...(req.refineScope?.trim()
                ? { lastRefineScope: req.refineScope.trim() }
                : {}),
            }),
            config,
            nextWork: {
              kind: "targeted_refine",
              phaseId: phase.id,
              prompt,
              refinementId: result.refinementId,
              artifactId: req.artifactId!,
              sourceVersion: req.artifactVersion!,
              status: "requires_clarification",
              clarificationReason: result.clarificationReason,
              clarificationCandidates: result.clarificationCandidates,
            },
            meta: metaBase,
          });
        }

        if (result.status === "validation_failed") {
          return success({
            kind: "mutate",
            expectedVersion,
            next: bumpSessionVersion(existing, {
              lastRefinePrompt: prompt,
              lastRequestKey: fingerprint,
              ...(req.refineScope?.trim()
                ? { lastRefineScope: req.refineScope.trim() }
                : {}),
            }),
            config,
            nextWork: {
              kind: "targeted_refine",
              phaseId: phase.id,
              prompt,
              refinementId: result.refinementId,
              artifactId: result.artifactId ?? req.artifactId!,
              sourceVersion: result.sourceVersion ?? req.artifactVersion!,
              status: "validation_failed",
              changes: result.changes,
              validationStatus: result.validation?.status,
              target: result.target
                ? {
                    slideId: result.target.slideId,
                    elementId: result.target.elementId,
                    path: result.target.path,
                    entityId: result.target.entityId,
                    entityKind: result.target.entityKind,
                    fieldPath: result.target.fieldPath,
                  }
                : undefined,
            },
            meta: metaBase,
          });
        }

        if (result.status === "applied" || result.status === "patch_validated") {
          const next = bumpSessionVersion(existing, {
            lastRefinePrompt: prompt,
            lastRequestKey: fingerprint,
            ...(req.refineScope?.trim()
              ? { lastRefineScope: req.refineScope.trim() }
              : {}),
            ...(result.request?.briefVersion != null
              ? { activeBriefVersion: result.request.briefVersion }
              : {}),
          });
          return success({
            kind: "mutate",
            expectedVersion,
            next,
            config,
            nextWork: {
              kind: "targeted_refine",
              phaseId: phase.id,
              prompt,
              refinementId: result.refinementId,
              artifactId: result.artifactId ?? req.artifactId!,
              sourceVersion: result.sourceVersion ?? req.artifactVersion!,
              newVersion: result.newVersion,
              status: result.status,
              changes: result.changes,
              validationStatus: result.validation?.status,
              target: result.target
                ? {
                    slideId: result.target.slideId,
                    elementId: result.target.elementId,
                    path: result.target.path,
                    entityId: result.target.entityId,
                    entityKind: result.target.entityKind,
                    fieldPath: result.target.fieldPath,
                  }
                : undefined,
            },
            meta: metaBase,
          });
        }

        return failure(
          cdfError(
            "INVALID_ACTION_PAYLOAD",
            `Refinement status: ${result.status}`,
            { refinementId: result.refinementId, status: result.status },
          ),
        );
      } catch (e) {
        if (e instanceof refinement.CdfRefinementError) {
          const codeMap: Record<string, CdfTransitionErrorCode> = {
            ARTIFACT_NOT_FOUND: "INVALID_ACTION_PAYLOAD",
            ARTIFACT_VERSION_NOT_FOUND: "INVALID_ACTION_PAYLOAD",
            STALE_CONTEXT: "SESSION_VERSION_CONFLICT",
            VERSION_CONFLICT: "SESSION_VERSION_CONFLICT",
            IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
            ASSET_NOT_FOUND: "INVALID_ACTION_PAYLOAD",
            UNSUPPORTED_OPERATION: "INVALID_ACTION_PAYLOAD",
            AMBIGUOUS_TARGET: "INVALID_ACTION_PAYLOAD",
            TARGET_NOT_FOUND: "INVALID_ACTION_PAYLOAD",
            ISOLATION_VIOLATION: "INVALID_ACTION_PAYLOAD",
            SCHEMA_INVALID: "INVALID_ACTION_PAYLOAD",
            VALIDATION_FAILED: "INVALID_ACTION_PAYLOAD",
          };
          return failure(
            cdfError(
              codeMap[e.refinementCode] ?? "INVALID_ACTION_PAYLOAD",
              e.message,
              e.metadata as Record<string, unknown>,
            ),
          );
        }
        throw e;
      }
    }

    // Legacy path: full-phase regenerate via nextWork.refine (no exact version)
    let next = bumpSessionVersion(existing, {
      lastRefinePrompt: prompt,
      ...(req.refineScope?.trim()
        ? { lastRefineScope: req.refineScope.trim() }
        : {}),
      lastRequestKey: fingerprint,
    });
    try {
      const cap = captureSourceAndResolveSync({
        sessionId: existing.sessionId,
        serviceId: existing.serviceId,
        projectId: existing.projectId,
        userId: existing.userId,
        type: "refinement",
        rawContent: prompt,
        source: "cdf_refine",
        metadata: {
          phaseId: phase.id,
          refineScope: req.refineScope,
          semantic: "refinement",
        },
      });
      next = {
        ...next,
        activeBriefId: cap.brief.activeBriefId,
        activeBriefVersion: cap.brief.version,
      };
    } catch {
      // best-effort
    }
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: { kind: "refine", phaseId: phase.id, prompt },
      meta: metaBase,
    });
  }

  if (req.action === "final_action") {
    if (!phase || phase.type !== "final") {
      return failure(
        cdfError(
          "FINAL_ACTION_NOT_ALLOWED",
          "final_action is only valid on final phase",
        ),
      );
    }
    const label = (req.finalAction ?? "").trim();
    const typedId = req.finalActionId?.trim();
    const allowedLabels = phase.finalActions ?? [];
    const canonicalFinal = canonical?.finalActions ?? [];
    let matchedLabel = label;
    if (typedId && canonicalFinal.length) {
      const hit = canonicalFinal.find((a) => a.id === typedId);
      if (!hit) {
        return failure(
          cdfError(
            "FINAL_ACTION_NOT_ALLOWED",
            `Invalid finalActionId "${typedId}"`,
          ),
        );
      }
      matchedLabel = hit.label;
    } else if (!label || !allowedLabels.includes(label)) {
      return failure(
        cdfError(
          "FINAL_ACTION_NOT_ALLOWED",
          `Invalid finalAction. Allowed: ${allowedLabels.join(", ")}`,
        ),
      );
    }
    const next = bumpSessionVersion(existing, {
      status: "completed",
      lastRequestKey: fingerprint,
    });
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: { kind: "materialize_final", action: matchedLabel },
      meta: metaBase,
    });
  }

  if (req.action === "handoff_studio") {
    const handoffId = config.studioHandoffAfterPhaseId;
    if (!handoffId || !isStudioHandoffPhaseComplete(existing, handoffId)) {
      return failure(
        cdfError(
          "ACTION_NOT_ALLOWED",
          `Approve phase "${handoffId ?? "studio handoff"}" before Send to Studio`,
        ),
      );
    }
    const next = bumpSessionVersion(existing, {
      productMode: "hybrid",
      modeOwnership: "studio",
      status: "handed_off",
      lastRequestKey: fingerprint,
    });
    return success({
      kind: "mutate",
      expectedVersion,
      next,
      config,
      nextWork: { kind: "studio_handoff" },
      meta: metaBase,
    });
  }

  return failure(
    cdfError("ACTION_NOT_ALLOWED", `Unknown action: ${req.action}`),
  );
}

export function applyPreparedTransition(
  prepared: Prepared,
): Result<CdfTransitionResult> {
  if (prepared.kind === "start_done" || prepared.kind === "replay") {
    return success(prepared.result);
  }
  return syncCommit(
    prepared.expectedVersion,
    prepared.next,
    prepared.config,
    prepared.nextWork,
    prepared.meta,
  );
}

/** Sync transactional entry (memory CAS). Backward-compatible with applyCdfTransition. */
export function executeCdfAction(
  req: CdfTransitionRequest,
): Result<CdfTransitionResult> {
  const prepared = prepareTransition(req);
  if (!prepared.ok) return prepared;
  return applyPreparedTransition(prepared.value);
}

/** Async transactional entry (memory + optional Mongo CAS). */
export async function executeCdfActionAsync(
  req: CdfTransitionRequest,
): Promise<Result<CdfTransitionResult>> {
  const prepared = prepareTransition(req);
  if (!prepared.ok) return prepared;
  if (prepared.value.kind === "start_done" || prepared.value.kind === "replay") {
    return success(prepared.value.result);
  }
  const { expectedVersion, next, config, nextWork, meta } = prepared.value;
  return commit(expectedVersion, next, config, nextWork, meta);
}
