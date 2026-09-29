/**
 * CDF 2.0 M2B — resolveGenerationContext (authoritative).
 *
 * Composes: session + ActiveBrief + canonical phase + selections/approvals.
 * Does NOT generate, transition, approve, or create artifacts.
 */

import {
  CDF_CONTRACT_VERSION,
  resolveCdfCanonicalService,
  tryResolveCdfPhaseDependencies,
  type CdfPhaseDefinition,
} from "../canonical";
import { cdfDependencySatisfied } from "../lifecycle/dependency-satisfaction";
import { getCdfSession } from "../session-store";
import { normalizeCdfSession } from "../state-machine/normalize";
import {
  getActiveBriefByVersion,
  getLatestActiveBrief,
  getRequirementQuery,
  listSourceInputs,
} from "../requirements";
import type { CdfRequirement } from "../requirements/types";
import { computeContextHash, createContextId } from "./hash";
import {
  filterRequirementsForPhase,
  isBlockingConflictKey,
} from "./phase-scope";
import {
  toContextSnapshot,
  validateResolvedGenerationContext,
} from "./validate";
import type {
  CdfContextDecisionRef,
  CdfContextRefinement,
  CdfContextRequirementRef,
  CdfContextSelectionRef,
  CdfContextWarning,
  CdfPhaseContractSlice,
  CdfUpstreamReference,
  ResolveGenerationContextInput,
  ResolveGenerationContextResult,
  ResolvedGenerationContext,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function toReqRef(r: CdfRequirement): CdfContextRequirementRef {
  return {
    requirementId: r.requirementId,
    key: r.key,
    displayValue: r.displayValue,
    category: r.category,
    priority: r.priority,
    explicit: r.explicit,
    sourceInputId: r.provenance.sourceInputId,
  };
}

function phaseSlice(phase: CdfPhaseDefinition): CdfPhaseContractSlice {
  return {
    phaseId: phase.phaseId,
    serviceId: phase.serviceId,
    name: phase.name,
    uxType: phase.uxType,
    generationModality: phase.generationModality,
    artifactType: phase.artifact.artifactType,
    artifactKey: phase.artifact.artifactKey,
    implementationStatus: phase.implementationStatus,
    dependencyPhaseIds: phase.dependencies.map((d) => d.phaseId),
    allowNonVisualReady: Boolean(phase.readiness.allowNonVisualReady),
    selectionMode: phase.selection.mode,
    approvalMode: phase.approval.mode,
    refinementEnabled: phase.refinement.enabled,
    refinementScopes: [...phase.refinement.scopes],
    entryMessage: phase.entryMessage,
    description: phase.description || "",
    executionStrategy: phase.executionStrategy,
    ...(phase.selection.choiceNoun
      ? { choiceNoun: phase.selection.choiceNoun }
      : {}),
    ...(phase.textLines?.length ? { textLines: [...phase.textLines] } : {}),
    ...(phase.outputLabel ? { outputLabel: phase.outputLabel } : {}),
  };
}

function parseRefinement(
  prompt?: string,
  scope?: string,
): CdfContextRefinement | undefined {
  if (!prompt?.trim()) return undefined;
  const p = prompt.trim();
  // Only set target when reliably explicit (e.g. "slide 7") — never invent.
  const slideHit = p.match(/\bslide\s+(\d+)\b/i);
  const target =
    slideHit?.[1] != null ? `slide-${slideHit[1]}` : undefined;
  const wantsSlideScope =
    /\bslide\b/i.test(p) || scope === "slide" || scope === "element";
  const ambiguous = wantsSlideScope && !target;
  return {
    prompt: p,
    ...(scope ? { scope } : target ? { scope: "slide" } : {}),
    ...(target ? { target } : {}),
    ambiguous,
  };
}

function containsSecret(value: string): boolean {
  return /api[_-]?key|password|secret|bearer\s+[a-z0-9._-]+|sk-[a-z0-9]{10,}/i.test(
    value,
  );
}

/**
 * Authoritative context resolution entry point.
 */
export function resolveGenerationContext(
  input: ResolveGenerationContextInput,
): ResolveGenerationContextResult {
  const warnings: CdfContextWarning[] = [];
  const raw = getCdfSession(input.sessionId);
  if (!raw) {
    return {
      ok: false,
      status: "invalid",
      code: "SESSION_NOT_FOUND",
      message: `CDF session not found: ${input.sessionId}`,
    };
  }
  const session = normalizeCdfSession(raw);

  if (
    typeof input.expectedSessionVersion === "number" &&
    input.expectedSessionVersion !== session.sessionVersion
  ) {
    return {
      ok: false,
      status: "stale",
      code: "SESSION_VERSION_MISMATCH",
      message: `Expected session version ${input.expectedSessionVersion}, current ${session.sessionVersion}`,
    };
  }

  const serviceId = input.serviceId ?? session.serviceId;
  const canonical = resolveCdfCanonicalService(serviceId);
  if (!canonical) {
    return {
      ok: false,
      status: "invalid",
      code: "INVALID_SERVICE",
      message: `Unknown service: ${serviceId}`,
    };
  }

  const phaseId = input.phaseId ?? session.phaseId;
  if (!phaseId) {
    return {
      ok: false,
      status: "invalid",
      code: "INVALID_PHASE",
      message: "No phaseId on session or input",
    };
  }

  const phase = canonical.phases.find((p) => p.phaseId === phaseId);
  if (!phase) {
    return {
      ok: false,
      status: "invalid",
      code: "INVALID_PHASE",
      message: `Unknown phase ${phaseId} for ${serviceId}`,
    };
  }
  if (phase.implementationStatus !== "active") {
    return {
      ok: false,
      status: "blocked",
      code: "PHASE_INACTIVE",
      message: `Phase ${phaseId} is ${phase.implementationStatus}`,
    };
  }

  // ActiveBrief by session reference (not "latest unrelated")
  let contextSource: ResolvedGenerationContext["contextSource"] = "canonical";
  let activeBrief = undefined as ReturnType<typeof getLatestActiveBrief>;
  if (session.activeBriefId && session.activeBriefVersion != null) {
    activeBrief = getActiveBriefByVersion(
      session.sessionId,
      session.activeBriefVersion,
    );
    if (!activeBrief || activeBrief.activeBriefId !== session.activeBriefId) {
      return {
        ok: false,
        status: "invalid",
        code: "ACTIVE_BRIEF_NOT_FOUND",
        message: `ActiveBrief ${session.activeBriefId}@v${session.activeBriefVersion} not found`,
      };
    }
  } else {
    activeBrief = getLatestActiveBrief(session.sessionId);
    if (!activeBrief) {
      contextSource = "legacy";
      warnings.push({
        code: "LEGACY_NO_ACTIVE_BRIEF",
        message:
          "No ActiveBrief on session — using legacy brief/masters compatibility path",
      });
    } else {
      warnings.push({
        code: "LEGACY_BRIEF_REF_MISSING",
        message:
          "Session missing activeBrief refs — using latest brief with warning",
      });
      contextSource = "legacy";
    }
  }

  const reqQuery = getRequirementQuery(session.sessionId);
  const sources = listSourceInputs(session.sessionId);

  // Current instruction
  let currentUserInstruction = input.currentUserInstruction?.trim();
  let currentSourceInputId = input.sourceInputId;
  if (!currentUserInstruction && input.sourceInputId) {
    const src = sources.find((s) => s.sourceInputId === input.sourceInputId);
    if (src) {
      currentUserInstruction = src.rawContent;
      currentSourceInputId = src.sourceInputId;
    }
  }
  if (!currentUserInstruction && input.refinePrompt?.trim()) {
    currentUserInstruction = input.refinePrompt.trim();
  }

  const refinement = parseRefinement(input.refinePrompt, input.refineScope);
  if (refinement?.ambiguous) {
    // Do not invent target — clarification required for slide-scoped claims without number
    // Soft: still allow ready with warning unless phase requires slide scope exclusively
    warnings.push({
      code: "AMBIGUOUS_REFINEMENT_TARGET",
      message:
        "Refinement mentions slide/element without a reliable target — target not invented",
    });
  }

  // Requirements: active only, phase-scoped; exclude superseded
  const historicalActive = reqQuery.activeRequirements;
  const scoped = filterRequirementsForPhase(historicalActive, phase);

  // Conflicts relevant to phase
  const unresolvedConflicts = (activeBrief?.unresolvedConflicts ?? reqQuery.conflicts)
    .map((c) => ({
      conflictId: c.conflictId,
      key: c.key,
      requirementIds: [...c.requirementIds].sort(),
      reason: c.reason,
      blocksGeneration: isBlockingConflictKey(c.key, phase),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const blocking = unresolvedConflicts.filter((c) => c.blocksGeneration);

  // Selections (authoritative only — never unselected candidates)
  const selections: CdfContextSelectionRef[] = [...session.selected]
    .map((s) => ({
      phaseId: s.phaseId,
      label: s.selectedRouteLabel ?? s.routeTitle ?? s.phaseId,
      routeTitle: s.routeTitle,
      routeIndex: s.selectedRouteIndex,
      ...(s.selectedChoiceId?.trim()
        ? { choiceId: s.selectedChoiceId.trim() }
        : {}),
      semantic: "selection" as const,
    }))
    .sort((a, b) => a.phaseId.localeCompare(b.phaseId));

  // Also pick selection.* requirements
  for (const r of historicalActive.filter((x) => x.key.startsWith("selection."))) {
    const phaseKey = r.key.replace(/^selection\./, "");
    if (!selections.some((s) => s.phaseId === phaseKey)) {
      selections.push({
        phaseId: phaseKey,
        label: r.displayValue,
        semantic: "selection",
      });
    }
  }
  selections.sort((a, b) => a.phaseId.localeCompare(b.phaseId));

  // Approved decisions — exclude legacy_select_compat provenance
  const approvedDecisions: CdfContextDecisionRef[] = [];
  for (const a of session.approved) {
    const isLegacySelectCompat = reqQuery.requirements.some(
      (r) =>
        r.provenance.sourceType === "legacy_select_compat" &&
        r.key.includes(a.phaseId) &&
        a.selectedRouteLabel != null,
    );
    // If this approval row exists only because of select_route dual-write and
    // there is a selection for same phase, treat as selection not approval.
    const hasSelection = selections.some((s) => s.phaseId === a.phaseId);
    if (hasSelection && a.selectedRouteLabel != null) {
      // Compatibility approval row — do not promote to approved decision
      if (isLegacySelectCompat || a.selectedRouteIndex != null) {
        continue;
      }
    }
    approvedDecisions.push({
      phaseId: a.phaseId,
      label: a.selectedRouteLabel ?? a.phaseId,
      artifactId: a.artifactId,
      executionId: a.executionId,
      note: a.note,
      semantic: "approval",
    });
  }
  for (const r of historicalActive.filter((x) => x.key.startsWith("approval."))) {
    const phaseKey = r.key.replace(/^approval\./, "");
    if (!approvedDecisions.some((d) => d.phaseId === phaseKey)) {
      approvedDecisions.push({
        phaseId: phaseKey,
        label: r.displayValue,
        semantic: "approval",
      });
    }
  }
  approvedDecisions.sort((a, b) => a.phaseId.localeCompare(b.phaseId));

  // Upstream dependencies — only required phases
  const upstreamInputs: CdfUpstreamReference[] = [];
  const upstreamOutputs: CdfUpstreamReference[] = [];
  const missingDeps: string[] = [];
  const resolvedDepsResult = tryResolveCdfPhaseDependencies(
    canonical.serviceId,
    phase.phaseId,
    phase,
  );
  const resolvedDeps = resolvedDepsResult.ok
    ? resolvedDepsResult.dependencies
    : [];

  for (const dep of phase.dependencies) {
    const depPhaseId = dep.phaseId;
    // Skip deferred contract_only deps that were remapped in legacy (select → design-routes)
    const depPhase = canonical.phases.find((p) => p.phaseId === depPhaseId);
    if (depPhase && depPhase.implementationStatus !== "active") {
      // Prefer mapped active upstream if present in session approvals
      const fallback =
        depPhaseId === "select"
          ? "design-routes"
          : depPhaseId === "slide-refinement"
            ? "full-deck"
            : null;
      if (fallback) {
        const ap = session.approved.find((a) => a.phaseId === fallback);
        const sel = session.selected.find((s) => s.phaseId === fallback);
        if (ap || sel) {
          upstreamInputs.push({
            phaseId: fallback,
            source: sel ? "legacy_approval_note" : "legacy_approval_note",
            referenceId: ap?.executionId ?? ap?.artifactId,
            label: sel?.selectedRouteLabel ?? ap?.selectedRouteLabel ?? fallback,
            note: ap?.note,
            approvedAt: ap?.approvedAt,
          });
          continue;
        }
      }
      warnings.push({
        code: "DEFERRED_DEPENDENCY",
        message: `Dependency ${depPhaseId} is ${depPhase.implementationStatus}`,
      });
      continue;
    }

    const approved = session.approved.find((a) => a.phaseId === depPhaseId);
    const selected = session.selected.find((s) => s.phaseId === depPhaseId);
    const depsResultRole = resolvedDeps.find(
      (d) => d.phaseId === depPhaseId,
    )?.requiredRole;
    // Canonical pins must satisfy the dependency requiredRole — never treat
    // generated-only as sufficient for selected/approved continuity.
    const pinSat = cdfDependencySatisfied(session, depPhaseId, {
      serviceId: canonical.serviceId,
      dependingPhaseId: phase.phaseId,
      artifactKey:
        typeof dep.artifactKey === "string" ? dep.artifactKey : undefined,
      requiredRole: depsResultRole,
    });
    // Legacy selected[]/approved[] may satisfy role-appropriate presence only:
    //   approved → approved note only
    //   selected → selected OR approved note
    //   generated → never (notes do not prove generation pins)
    const legacyRoleOk =
      depsResultRole === "generated"
        ? false
        : depsResultRole === "approved"
          ? Boolean(approved)
          : Boolean(approved || selected);
    if (!legacyRoleOk && !pinSat.ok) {
      if (dep.required !== false) {
        missingDeps.push(depPhaseId);
      }
      continue;
    }
    if (approved && depsResultRole !== "generated") {
      upstreamOutputs.push({
        phaseId: depPhaseId,
        source: approved.executionId
          ? "legacy_execution"
          : "legacy_approval_note",
        referenceId: approved.executionId ?? approved.artifactId,
        label: approved.selectedRouteLabel ?? depPhaseId,
        note: approved.note,
        approvedAt: approved.approvedAt,
      });
      if (approved.executionId) {
        warnings.push({
          code: "LEGACY_UPSTREAM_EXECUTION",
          message: `Upstream ${depPhaseId} uses legacy_execution ref (not Artifact id)`,
        });
      }
    } else if (
      selected &&
      depsResultRole !== "approved" &&
      depsResultRole !== "generated"
    ) {
      upstreamInputs.push({
        phaseId: depPhaseId,
        source: "legacy_approval_note",
        label: selected.selectedRouteLabel ?? selected.routeTitle,
      });
    } else {
      // Role-satisfied canonical pin only (pinSat.ok). Never broaden beyond
      // requiredRole lists — mirror rolePreferenceForDependencyRole.
      const artifactKey =
        typeof dep.artifactKey === "string" ? dep.artifactKey : undefined;
      const matchPin = (list: typeof session.approvedArtifacts) =>
        list?.find((r) => {
          if (r.phaseId !== depPhaseId) return false;
          if (
            artifactKey &&
            r.artifactKey &&
            r.artifactKey !== "unknown" &&
            r.artifactKey !== artifactKey
          ) {
            return false;
          }
          return true;
        });
      const pin =
        depsResultRole === "generated"
          ? matchPin(session.generatedArtifacts)
          : depsResultRole === "approved"
            ? matchPin(session.approvedArtifacts)
            : matchPin(session.approvedArtifacts) ??
              matchPin(session.selectedArtifacts);
      if (!pin) {
        if (dep.required !== false) missingDeps.push(depPhaseId);
        continue;
      }
      upstreamOutputs.push({
        phaseId: depPhaseId,
        source: "canonical_artifact",
        referenceId: `${pin.artifactId}@${pin.version}`,
        label: pin.artifactKey ?? depPhaseId,
      });
    }
  }

  // Masters as transitional refs
  if (session.masters.masterExecutionId) {
    upstreamOutputs.push({
      phaseId: session.phaseId ?? phaseId,
      source: "legacy_master",
      referenceId: session.masters.masterExecutionId,
      label: "masterExecutionId",
    });
  }

  upstreamInputs.sort((a, b) => a.phaseId.localeCompare(b.phaseId));
  upstreamOutputs.sort((a, b) => a.phaseId.localeCompare(b.phaseId));

  const constraints = scoped
    .filter(
      (r) =>
        r.category === "constraint" ||
        r.category === "mandatory_content" ||
        r.category === "quantity" ||
        r.category === "dimension",
    )
    .map(toReqRef);
  const exclusions = scoped
    .filter((r) => r.category === "forbidden_content")
    .map(toReqRef);
  const references = scoped
    .filter((r) => r.category === "reference" || r.category === "asset")
    .map(toReqRef);
  const activeRequirements = scoped.map(toReqRef);

  // Secret scrub of instruction
  if (currentUserInstruction && containsSecret(currentUserInstruction)) {
    warnings.push({
      code: "SECRET_LIKE_CONTENT_REDACTED",
      message: "Current instruction contained secret-like patterns; redacted",
    });
    currentUserInstruction = "[redacted]";
  }

  let status: ResolvedGenerationContext["status"] = "ready";
  if (blocking.length) {
    status = "requires_clarification";
  }
  if (missingDeps.length) {
    status = "blocked";
  }
  if (refinement?.ambiguous && phase.refinement.scopes.includes("slide")) {
    // clarification preferred but not hard-block unless no prompt at all
    if (status === "ready") status = "requires_clarification";
  }

  if (status === "blocked" && missingDeps.length) {
    return {
      ok: false,
      status: "blocked",
      code: "DEPENDENCY_NOT_SATISFIED",
      message: `Missing required upstream phases: ${missingDeps.join(", ")}`,
      warnings,
    };
  }

  const phaseContext = phaseSlice(phase);
  const semanticBase = {
    serviceId: canonical.serviceId,
    phaseId: phase.phaseId,
    sessionVersion: session.sessionVersion,
    activeBriefId: activeBrief?.activeBriefId ?? session.activeBriefId,
    activeBriefVersion: activeBrief?.version ?? session.activeBriefVersion,
    currentUserInstruction,
    activeRequirements,
    constraints,
    exclusions,
    approvedDecisions,
    selections,
    upstreamInputs,
    upstreamOutputs,
    refinement,
    unresolvedConflicts,
    phaseContext,
  };

  const contextHash = computeContextHash(semanticBase);
  const contextId = createContextId(session.sessionId, phase.phaseId, contextHash);

  const context: ResolvedGenerationContext = {
    contextId,
    contextHash,
    status,
    contextSource,
    projectId: session.projectId,
    sessionId: session.sessionId,
    serviceId: canonical.serviceId,
    phaseId: phase.phaseId,
    phaseContractVersion: CDF_CONTRACT_VERSION,
    sessionVersion: session.sessionVersion,
    activeBriefId: activeBrief?.activeBriefId ?? session.activeBriefId,
    activeBriefVersion: activeBrief?.version ?? session.activeBriefVersion,
    currentUserInstruction,
    currentSourceInputId,
    activeRequirements,
    constraints,
    exclusions,
    references,
    approvedDecisions,
    selections,
    upstreamInputs,
    upstreamOutputs,
    refinement,
    serviceContext: {
      serviceId: canonical.serviceId,
      displayName: canonical.displayName,
    },
    phaseContext,
    provenance: {
      requirementIds: activeRequirements.map((r) => r.requirementId).sort(),
      sourceInputIds: [
        ...new Set([
          ...activeRequirements.map((r) => r.sourceInputId),
          ...(currentSourceInputId ? [currentSourceInputId] : []),
        ]),
      ].sort(),
      decisionPhaseIds: approvedDecisions.map((d) => d.phaseId).sort(),
      selectionPhaseIds: selections.map((s) => s.phaseId).sort(),
      upstreamRefs: [...upstreamInputs, ...upstreamOutputs]
        .map((u) => ({
          phaseId: u.phaseId,
          source: u.source,
          referenceId: u.referenceId,
        }))
        .sort((a, b) => a.phaseId.localeCompare(b.phaseId)),
    },
    warnings,
    unresolvedConflicts,
    createdAt: nowIso(),
  };

  const issues = validateResolvedGenerationContext(context);
  if (issues.some((i) => i.code === "MODALITY_UX_CONFLATION")) {
    // Should never happen for valid registry — treat as invalid
    return {
      ok: false,
      status: "invalid",
      code: "MODALITY_UX_CONFLATION",
      message: issues.map((i) => i.message).join("; "),
    };
  }

  void toContextSnapshot;
  return { ok: true, context };
}

export function resolveGenerationContextOrThrow(
  input: ResolveGenerationContextInput,
): ResolvedGenerationContext {
  const result = resolveGenerationContext(input);
  if (!result.ok) {
    const err = new Error(result.message);
    (err as Error & { cdfContextCode: string; status: string }).cdfContextCode =
      result.code;
    (err as Error & { status: string }).status = result.status;
    throw err;
  }
  return result.context;
}
