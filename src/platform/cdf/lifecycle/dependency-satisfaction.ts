/**
 * Generic CDF dependency / lineage satisfaction — framework-wide.
 *
 * Consumes resolved requiredRole from the CDF phase contract
 * (never serviceId === … / phaseId heuristics / artifactKey fuzzy match).
 */

import {
  CdfDependencyContractError,
  deriveDependencyRequiredRole,
  resolveCdfPhaseDefinition,
  tryResolveCdfPhaseDependencies,
  resolveCdfPhaseExecutionContract,
  tryResolveDependencyRequiredRole,
  type CdfDependencyRequiredRole,
  type CdfPhaseDefinition,
} from "../canonical";
import { isCdfCanonicalArtifactId } from "../artifacts/ids";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";

export function sessionHasCanonicalArtifactRefs(
  session: CdfSessionState,
): boolean {
  const lists = [
    session.approvedArtifacts,
    session.selectedArtifacts,
    session.generatedArtifacts,
  ];
  for (const list of lists) {
    for (const r of list ?? []) {
      if (isCdfCanonicalArtifactId(String(r.artifactId ?? ""))) return true;
    }
  }
  return false;
}

function matchRef(
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
  // Exact artifactKey when both sides have a real key. Do not reject pins
  // stored with placeholder "unknown" — phaseId + exact version remain identity.
  // No fuzzy / substring artifactKey matching.
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
  session: CdfSessionState,
  phaseId: string,
  artifactKey: string | undefined,
  role: CdfDependencyRequiredRole,
): CdfSessionArtifactRef | undefined {
  const pick = (list: CdfSessionArtifactRef[] | undefined) =>
    list?.find((r) => matchRef(r, phaseId, artifactKey));

  if (role === "generated") {
    return pick(session.generatedArtifacts);
  }
  if (role === "selected") {
    // Approved implies selected for continuity; generated never satisfies.
    return pick(session.approvedArtifacts) ?? pick(session.selectedArtifacts);
  }
  return pick(session.approvedArtifacts);
}

function generatedOnlyPresent(
  session: CdfSessionState,
  phaseId: string,
  artifactKey?: string,
): boolean {
  const gen = session.generatedArtifacts?.some((r) =>
    matchRef(r, phaseId, artifactKey),
  );
  if (!gen) return false;
  const selectedOrApproved =
    session.selectedArtifacts?.some((r) => matchRef(r, phaseId, artifactKey)) ||
    session.approvedArtifacts?.some((r) => matchRef(r, phaseId, artifactKey));
  return !selectedOrApproved;
}

function legacyPhaseSatisfied(
  session: CdfSessionState,
  phaseId: string,
  role: CdfDependencyRequiredRole,
): boolean {
  if (role === "approved") {
    return session.approved.some((a) => a.phaseId === phaseId);
  }
  if (role === "selected") {
    return (
      session.selected.some((s) => s.phaseId === phaseId) ||
      session.approved.some((a) => a.phaseId === phaseId)
    );
  }
  // generated — legacy selected[]/approved[] rows do not prove generation pins
  return false;
}

export type CdfDependencySatisfaction =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing"
        | "role_not_met"
        | "not_approved"
        | "not_selected"
        | "dependency_contract_invalid";
      requiredRole?: CdfDependencyRequiredRole;
      generatedOnlyPresent: boolean;
      message?: string;
    };

/**
 * Whether an upstream dependency phase is satisfied for the session.
 * When canonical ArtifactVersion refs exist, exact pins + requiredRole apply.
 * Otherwise legacy selected[]/approved[] rows (gate / pre-canonical traffic).
 */
export function cdfDependencySatisfied(
  session: CdfSessionState,
  dependencyPhaseId: string,
  opts?: {
    serviceId?: string;
    artifactKey?: string;
    requiredRole?: CdfDependencyRequiredRole;
    upstreamPhase?: CdfPhaseDefinition;
    /** Phase whose dependencies declare the requiredRole (current phase). */
    dependingPhaseId?: string;
  },
): CdfDependencySatisfaction {
  const serviceId = opts?.serviceId ?? session.serviceId;
  const upstream =
    opts?.upstreamPhase ??
    resolveCdfPhaseDefinition(serviceId, dependencyPhaseId);

  let requiredRole = opts?.requiredRole;
  if (!requiredRole && opts?.dependingPhaseId) {
    const depsResult = tryResolveCdfPhaseDependencies(
      serviceId,
      opts.dependingPhaseId,
    );
    if (!depsResult.ok) {
      return {
        ok: false,
        reason: "dependency_contract_invalid",
        generatedOnlyPresent: false,
        message: depsResult.message,
      };
    }
    requiredRole = depsResult.dependencies.find(
      (d) => d.phaseId === dependencyPhaseId,
    )?.requiredRole;
  }
  if (!requiredRole) {
    const roleResult = tryResolveDependencyRequiredRole(
      { phaseId: dependencyPhaseId, required: true },
      upstream,
    );
    if (!roleResult.ok) {
      return {
        ok: false,
        reason: "dependency_contract_invalid",
        generatedOnlyPresent: false,
        message: roleResult.message,
      };
    }
    requiredRole = roleResult.requiredRole;
  }

  if (!sessionHasCanonicalArtifactRefs(session)) {
    return legacyPhaseSatisfied(session, dependencyPhaseId, requiredRole)
      ? { ok: true }
      : {
          ok: false,
          reason: "missing",
          requiredRole,
          generatedOnlyPresent: false,
        };
  }

  // Config / modality-none: often no cdfart_* — accept legacy row.
  if (
    upstream &&
    (upstream.generationModality === "none" ||
      upstream.artifact.artifactType === "none" ||
      upstream.artifact.artifactType === "config_choice")
  ) {
    if (legacyPhaseSatisfied(session, dependencyPhaseId, requiredRole)) {
      return { ok: true };
    }
  }

  const artifactKey =
    opts?.artifactKey ??
    (typeof upstream?.artifact.artifactKey === "string"
      ? upstream.artifact.artifactKey
      : undefined);

  const pin = findPin(session, dependencyPhaseId, artifactKey, requiredRole);
  if (pin) return { ok: true };

  // Website HTML/ZIP phases approve art_* export ids that never become
  // cdfart_* pins — the legacy approved/selected row is their only record.
  if (
    upstream &&
    resolveCdfPhaseExecutionContract({ phase: upstream })?.allowNonVisualReady &&
    legacyPhaseSatisfied(session, dependencyPhaseId, requiredRole)
  ) {
    return { ok: true };
  }

  const genOnly = generatedOnlyPresent(
    session,
    dependencyPhaseId,
    artifactKey,
  );
  if (genOnly) {
    return {
      ok: false,
      reason:
        requiredRole === "approved"
          ? "not_approved"
          : requiredRole === "selected"
            ? "not_selected"
            : "role_not_met",
      requiredRole,
      generatedOnlyPresent: true,
    };
  }

  const weaker =
    requiredRole === "approved" &&
    Boolean(
      session.selectedArtifacts?.some((r) =>
        matchRef(r, dependencyPhaseId, artifactKey),
      ) ||
        session.generatedArtifacts?.some((r) =>
          matchRef(r, dependencyPhaseId, artifactKey),
        ),
    );
  if (weaker) {
    return {
      ok: false,
      reason: "not_approved",
      requiredRole,
      generatedOnlyPresent: false,
    };
  }

  return {
    ok: false,
    reason: "missing",
    requiredRole,
    generatedOnlyPresent: false,
  };
}

/**
 * Assert all dependencies of a phase for transition / generation.
 */
export function assertCdfPhaseDependencies(
  session: CdfSessionState,
  phase: { id: string; inherits?: string[] },
  canonical?: CdfPhaseDefinition,
): CdfDependencySatisfaction & { dependencyPhaseId?: string } {
  const serviceId = canonical?.serviceId ?? session.serviceId;
  const phaseId = canonical?.phaseId ?? phase.id;
  const depsResult = tryResolveCdfPhaseDependencies(
    serviceId,
    phaseId,
    canonical,
  );
  if (!depsResult.ok) {
    return {
      ok: false,
      reason: "dependency_contract_invalid",
      generatedOnlyPresent: false,
      message: depsResult.message,
    };
  }
  const resolvedDeps = depsResult.dependencies;

  const depIds =
    resolvedDeps.length > 0
      ? resolvedDeps.map((d) => d.phaseId)
      : canonical?.dependencies.map((d) => d.phaseId) ?? phase.inherits ?? [];

  for (const depId of depIds) {
    const resolved = resolvedDeps.find((d) => d.phaseId === depId);
    const sat = cdfDependencySatisfied(session, depId, {
      serviceId,
      artifactKey: resolved?.artifactKey,
      requiredRole: resolved?.requiredRole,
      dependingPhaseId: phaseId,
    });
    if (!sat.ok) {
      return { ...sat, dependencyPhaseId: depId };
    }
  }
  return { ok: true };
}

/** Whether select_route must fail-closed on missing ArtifactVersion identity. */
export function selectRequiresExactArtifactIdentity(
  session: CdfSessionState,
  phase: CdfPhaseDefinition | undefined,
): boolean {
  if (!sessionHasCanonicalArtifactRefs(session)) return false;
  if (!phase) return true;
  const contract = resolveCdfPhaseExecutionContract({ phase });
  return contract?.requiresExactArtifactOnSelect !== false;
}

/** @deprecated Prefer tryResolveDependencyRequiredRole — kept for call sites. */
export function resolveRequiredRoleOrThrow(
  dep: { phaseId: string; required: boolean; requiredRole?: CdfDependencyRequiredRole },
  upstream: CdfPhaseDefinition | undefined,
): CdfDependencyRequiredRole {
  const result = tryResolveDependencyRequiredRole(dep, upstream);
  if (!result.ok) {
    throw new CdfDependencyContractError(
      result.code,
      result.message,
      result.details,
    );
  }
  return result.requiredRole;
}

/** Re-export derive for tests that assert mapping without a depending phase. */
export { deriveDependencyRequiredRole };
