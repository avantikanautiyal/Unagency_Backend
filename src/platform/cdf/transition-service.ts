/**
 * CDF stage transition executor.
 * Enforces CTA allowlist, approval inheritance, and Hybrid studio handoff.
 * Does not run generators itself — returns nextWork hints for the client/execution stack.
 */

import { failure, success, type Result } from "../core/result";
import { ValidationError } from "../core/errors";
import { resolveCdfServiceConfig } from "./service-configs";
import {
  createCdfSessionId,
  getCdfSession,
  saveCdfSession,
} from "./session-store";
import type {
  CdfApprovedPhase,
  CdfFlowPhase,
  CdfServiceConfig,
  CdfSessionState,
  CdfTransitionAction,
  CdfTransitionRequest,
  CdfTransitionResult,
  CdfUiHint,
} from "./types";

function extractBrandNameFromBrief(brief: string): string | undefined {
  const patterns = [
    /Brand name:\s*([^\n]+)/i,
    /(?:logo|identity|branding)\s+for\s+(?:my\s+brand\s+)?([A-Z][A-Za-z0-9&'.-]{1,40})/i,
    /(?:brand|company|product)\s+(?:name\s+)?(?:is|called|:)\s*["']?([A-Z][A-Za-z0-9&'.-]{1,40})/i,
    /(?:named|called)\s+["']?([A-Z][A-Za-z0-9&'.-]{1,40})["']?/i,
  ];
  for (const pattern of patterns) {
    const match = brief.match(pattern);
    const name = match?.[1]?.trim().replace(/^["']|["']$/g, "").replace(/[.,;:]+$/, "");
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
  return [...new Set([...hex, ...names.map((n) => n.toLowerCase())])].slice(0, 8);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isApproved(session: CdfSessionState, phaseId: string): boolean {
  return session.approved.some((a) => a.phaseId === phaseId);
}

function assertInherits(
  session: CdfSessionState,
  phase: CdfFlowPhase
): string | undefined {
  for (const id of phase.inherits ?? []) {
    if (!isApproved(session, id)) {
      return `Phase "${phase.id}" requires approved phase "${id}"`;
    }
  }
  return undefined;
}

function nextWorkForPhase(
  phase: CdfFlowPhase
): CdfTransitionResult["nextWork"] {
  if (phase.generator === "none") {
    return { kind: "show_phase", phaseId: phase.id };
  }
  if (phase.generator === "materialize") {
    return { kind: "materialize_final" };
  }
  return {
    kind: "generate",
    phaseId: phase.id,
    generator: phase.generator,
  };
}

function currentPhase(
  config: CdfServiceConfig,
  session: CdfSessionState
): CdfFlowPhase | null {
  if (session.phaseIndex < 0 || session.phaseIndex >= config.phases.length) {
    return null;
  }
  return config.phases[session.phaseIndex] ?? null;
}

function buildUi(
  config: CdfServiceConfig,
  session: CdfSessionState
): CdfUiHint {
  const phase = currentPhase(config, session);
  const allowedActions: CdfTransitionAction[] = [];

  if (session.modeOwnership === "studio") {
    return {
      progressLabels: config.phases.map((p) => p.progressLabel),
      currentPhaseIndex: session.phaseIndex,
      currentPhase: phase,
      allowedActions: [],
      showSendToStudio: false,
      refineExamples: [],
      finalActions: [],
    };
  }

  if (session.phaseIndex < 0) {
    allowedActions.push("submit_brief");
  } else if (phase) {
    if (phase.type === "routes") allowedActions.push("select_route");
    if (
      phase.type === "text-approval" ||
      phase.type === "output" ||
      phase.type === "mockup" ||
      phase.type === "multi-output"
    ) {
      allowedActions.push("approve", "refine");
    }
    if (phase.type === "final") allowedActions.push("final_action");
  }

  const handoffId = config.studioHandoffAfterPhaseId;
  const showSendToStudio =
    session.productMode === "hybrid" &&
    Boolean(handoffId) &&
    isApproved(session, handoffId!) &&
    session.modeOwnership === "ai";

  if (showSendToStudio) allowedActions.push("handoff_studio");

  return {
    progressLabels: config.phases.map((p) => p.progressLabel),
    currentPhaseIndex: session.phaseIndex,
    currentPhase: phase,
    allowedActions,
    showSendToStudio,
    refineExamples: phase?.refineExamples ?? [],
    finalActions: phase?.type === "final" ? phase.finalActions ?? [] : [],
  };
}

function advanceToPhase(
  session: CdfSessionState,
  config: CdfServiceConfig,
  index: number
): CdfSessionState {
  const phase = config.phases[index];
  return {
    ...session,
    phaseIndex: index,
    phaseId: phase?.id ?? null,
    updatedAt: nowIso(),
  };
}

function resultOf(
  session: CdfSessionState,
  config: CdfServiceConfig,
  nextWork: CdfTransitionResult["nextWork"]
): CdfTransitionResult {
  return {
    session,
    config,
    ui: buildUi(config, session),
    nextWork,
  };
}

export function getCdfSessionResult(
  sessionId: string
): Result<CdfTransitionResult> {
  const session = getCdfSession(sessionId);
  if (!session) {
    return failure(new ValidationError(`CDF session not found: ${sessionId}`));
  }
  const config = resolveCdfServiceConfig(session.serviceId);
  if (!config) {
    return failure(new ValidationError(`Unknown CDF service: ${session.serviceId}`));
  }
  const phase = currentPhase(config, session);
  return success(
    resultOf(session, config, phase
      ? { kind: "show_phase", phaseId: phase.id }
      : { kind: "await_brief" })
  );
}

export function applyCdfTransition(
  req: CdfTransitionRequest
): Result<CdfTransitionResult> {
  const action = req.action;

  if (action === "start") {
    const serviceKey = req.serviceId;
    if (!serviceKey) {
      return failure(new ValidationError("serviceId is required for start"));
    }
    const config = resolveCdfServiceConfig(serviceKey);
    if (!config) {
      return failure(new ValidationError(`Unknown CDF service: ${serviceKey}`));
    }
    const ts = nowIso();
    const session: CdfSessionState = {
      sessionId: createCdfSessionId(),
      serviceId: config.serviceId,
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      projectId: req.projectId,
      userId: req.userId,
      brief: undefined,
      phaseIndex: -1,
      phaseId: null,
      approved: [],
      masters: {},
      modeOwnership: "ai",
      productMode: req.productMode ?? "ai",
      createdAt: ts,
      updatedAt: ts,
    };
    saveCdfSession(session);
    return success(resultOf(session, config, { kind: "await_brief" }));
  }

  const sessionId = req.sessionId;
  if (!sessionId) {
    return failure(new ValidationError("sessionId is required"));
  }
  const existing = getCdfSession(sessionId);
  if (!existing) {
    return failure(new ValidationError(`CDF session not found: ${sessionId}`));
  }
  if (existing.modeOwnership === "studio" && action !== "handoff_studio") {
    return failure(
      new ValidationError("Session handed off to studio — AI transitions are locked")
    );
  }

  const config = resolveCdfServiceConfig(existing.serviceId);
  if (!config) {
    return failure(new ValidationError(`Unknown CDF service: ${existing.serviceId}`));
  }

  let session = { ...existing, updatedAt: nowIso() };

  if (action === "submit_brief") {
    const brief = (req.brief ?? "").trim();
    if (!brief) {
      return failure(new ValidationError("brief is required"));
    }
    const brandName = extractBrandNameFromBrief(brief);
    const brandColors = extractColorTokensFromBrief(brief);
    session = {
      ...session,
      brief,
      productMode: req.productMode ?? session.productMode,
      projectId: req.projectId ?? session.projectId,
      masters: {
        ...session.masters,
        ...(brandName ? { brandName } : {}),
        ...(brandColors.length ? { brandColors } : {}),
      },
    };
    session = advanceToPhase(session, config, 0);
    saveCdfSession(session);
    const phase = config.phases[0]!;
    return success(resultOf(session, config, nextWorkForPhase(phase)));
  }

  const phase = currentPhase(config, session);
  if (!phase && action !== "handoff_studio") {
    return failure(new ValidationError("No active CDF phase"));
  }

  if (action === "select_route") {
    if (!phase || phase.type !== "routes") {
      return failure(new ValidationError("select_route is only valid on routes phases"));
    }
    const inheritErr = assertInherits(session, phase);
    if (inheritErr) return failure(new ValidationError(inheritErr));
    const idx = req.routeIndex;
    // AI-generated routes (launch_routes) may not exist in config — allow 0..N.
    const configRouteCount = phase.routes?.length ?? 0;
    const maxIdx = Math.max(configRouteCount, 8) - 1;
    if (idx == null || !Number.isInteger(idx) || idx < 0 || idx > maxIdx) {
      return failure(new ValidationError("Valid routeIndex is required"));
    }
    const route = phase.routes?.[idx];
    const label =
      req.routeLabel?.trim() ||
      route?.label ||
      `Route ${idx + 1}`;
    const title =
      req.routeTitle?.trim() ||
      route?.title ||
      label;
    const desc = req.routeDesc?.trim() || route?.desc;
    const approved: CdfApprovedPhase = {
      phaseId: phase.id,
      approvedAt: nowIso(),
      selectedRouteIndex: idx,
      selectedRouteLabel: label,
      artifactId: req.artifactId,
      executionId: req.executionId,
      ...(req.note?.trim() ? { note: req.note.trim() } : {}),
    };
    session = {
      ...session,
      approved: [...session.approved.filter((a) => a.phaseId !== phase.id), approved],
      masters: {
        ...session.masters,
        routeId: label,
        routeTitle: title,
        ...(desc ? { routeDesc: desc } : {}),
      },
    };
    const nextIndex = session.phaseIndex + 1;
    if (nextIndex >= config.phases.length) {
      saveCdfSession(session);
      return success(resultOf(session, config, { kind: "none" }));
    }
    session = advanceToPhase(session, config, nextIndex);
    saveCdfSession(session);
    const next = config.phases[nextIndex]!;
    return success(resultOf(session, config, nextWorkForPhase(next)));
  }

  if (action === "approve") {
    if (
      !phase ||
      (phase.type !== "text-approval" &&
        phase.type !== "output" &&
        phase.type !== "mockup" &&
        phase.type !== "multi-output")
    ) {
      return failure(new ValidationError("approve is not valid for this phase"));
    }
    const inheritErr = assertInherits(session, phase);
    if (inheritErr) return failure(new ValidationError(inheritErr));
    const approved: CdfApprovedPhase = {
      phaseId: phase.id,
      approvedAt: nowIso(),
      artifactId: req.artifactId,
      executionId: req.executionId,
      ...(req.note?.trim() ? { note: req.note.trim() } : {}),
    };
    session = {
      ...session,
      approved: [...session.approved.filter((a) => a.phaseId !== phase.id), approved],
      masters: {
        ...session.masters,
        masterArtifactId: req.artifactId ?? session.masters.masterArtifactId,
        masterExecutionId: req.executionId ?? session.masters.masterExecutionId,
      },
    };
    const nextIndex = session.phaseIndex + 1;
    if (nextIndex >= config.phases.length) {
      saveCdfSession(session);
      return success(resultOf(session, config, { kind: "none" }));
    }
    session = advanceToPhase(session, config, nextIndex);
    saveCdfSession(session);
    const next = config.phases[nextIndex]!;
    return success(resultOf(session, config, nextWorkForPhase(next)));
  }

  if (action === "refine") {
    if (
      !phase ||
      (phase.type !== "text-approval" &&
        phase.type !== "output" &&
        phase.type !== "mockup" &&
        phase.type !== "multi-output")
    ) {
      return failure(new ValidationError("refine is not valid for this phase"));
    }
    const prompt = (req.refinePrompt ?? "").trim();
    if (!prompt) {
      return failure(new ValidationError("refinePrompt is required"));
    }
    saveCdfSession(session);
    return success(
      resultOf(session, config, {
        kind: "refine",
        phaseId: phase.id,
        prompt,
      })
    );
  }

  if (action === "final_action") {
    if (!phase || phase.type !== "final") {
      return failure(new ValidationError("final_action is only valid on final phase"));
    }
    const label = (req.finalAction ?? "").trim();
    if (!label || !(phase.finalActions ?? []).includes(label)) {
      return failure(
        new ValidationError(
          `Invalid finalAction. Allowed: ${(phase.finalActions ?? []).join(", ")}`
        )
      );
    }
    saveCdfSession(session);
    return success(
      resultOf(session, config, { kind: "materialize_final", action: label })
    );
  }

  if (action === "handoff_studio") {
    const handoffId = config.studioHandoffAfterPhaseId;
    if (!handoffId || !isApproved(session, handoffId)) {
      return failure(
        new ValidationError(
          `Approve phase "${handoffId ?? "studio handoff"}" before Send to Studio`
        )
      );
    }
    // Sending to studio always implies hybrid ownership from this point.
    session = {
      ...session,
      productMode: "hybrid",
      modeOwnership: "studio",
      updatedAt: nowIso(),
    };
    saveCdfSession(session);
    return success(resultOf(session, config, { kind: "studio_handoff" }));
  }

  return failure(new ValidationError(`Unknown action: ${action}`));
}
