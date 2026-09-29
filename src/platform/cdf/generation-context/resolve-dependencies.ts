/**
 * Resolve phase dependencies → exact session artifact refs → rehydrated upstream.
 * Never substitutes latest/HEAD. Never invents content from approval notes.
 *
 * Role preference comes solely from the CDF dependency-role contract:
 *   resolveCdfPhaseDependencies → requiredRole → rolePreferenceForDependencyRole
 */

import { resolveCdfCanonicalService } from "../canonical";
import { CdfArtifactError } from "../artifacts/errors";
import { PRESENTATION_ARTIFACT_KEYS } from "../artifacts/presentation/keys";
import {
  CdfDependencyContractError,
  rolePreferenceForDependencyRole,
  tryResolveCdfPhaseDependencies,
  type CdfDependencyRequiredRole,
} from "../canonical";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";
import {
  createArtifactContextLoader,
  loadUpstreamFromSessionRef,
  type ArtifactContextLoader,
} from "./artifact-context-loader";
import type {
  GenerationContextErrorCode,
  UpstreamArtifactContext,
} from "./types";

export type ResolveUpstreamArtifactsInput = {
  session: CdfSessionState;
  serviceId: string;
  phaseId: string;
  organizationId?: string;
  projectId?: string;
  loader?: ArtifactContextLoader;
};

/** Observable skip when an optional exact pin/ref cannot be loaded. */
export type UpstreamOptionalSkip = {
  readonly phaseId?: string;
  readonly artifactKey?: string;
  readonly artifactId?: string;
  readonly version?: number;
  readonly reason: string;
};

export type ResolveUpstreamArtifactsResult =
  | {
      ok: true;
      upstream: UpstreamArtifactContext[];
      loader: ArtifactContextLoader;
      skippedOptional: UpstreamOptionalSkip[];
    }
  | {
      ok: false;
      code: GenerationContextErrorCode;
      message: string;
      details?: Record<string, unknown>;
    };

/** Role prefs admitted by dependency resolution — no "any" escape hatch. */
type DependencySessionRolePreference = ReturnType<
  typeof rolePreferenceForDependencyRole
>;

function refsMatchPhaseAndKey(
  r: CdfSessionArtifactRef,
  phaseId: string | undefined,
  artifactKey: string | undefined,
): boolean {
  if (phaseId !== undefined && r.phaseId !== phaseId) return false;
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

/**
 * Exact phase/key session pin lookup for CDF dependency resolution.
 * rolePreference is required — never defaults to scanning all lifecycle lists.
 */
function findSessionRef(
  session: CdfSessionState,
  phaseId: string,
  artifactKey: string | undefined,
  rolePreference: DependencySessionRolePreference,
): CdfSessionArtifactRef | undefined {
  const match = (list: CdfSessionArtifactRef[] | undefined) =>
    list?.find((r) => refsMatchPhaseAndKey(r, phaseId, artifactKey));

  if (rolePreference === "approved_only") {
    return match(session.approvedArtifacts);
  }
  if (rolePreference === "selected_or_approved") {
    // Approved implies selected continuity; generated never satisfies.
    return match(session.approvedArtifacts) ?? match(session.selectedArtifacts);
  }
  // generated_only
  return match(session.generatedArtifacts);
}

/**
 * Exact artifactKey lookup constrained by dependency requiredRole.
 * Never falls through to a weaker lifecycle list.
 */
function findByArtifactKeyForRole(
  session: CdfSessionState,
  artifactKey: string,
  requiredRole: CdfDependencyRequiredRole,
): CdfSessionArtifactRef | undefined {
  const preference = rolePreferenceForDependencyRole(requiredRole);
  const match = (list: CdfSessionArtifactRef[] | undefined) =>
    list?.find(
      (r) =>
        r.artifactKey === artifactKey &&
        Number.isInteger(r.version) &&
        (r.version as number) >= 1,
    );

  if (preference === "approved_only") {
    return match(session.approvedArtifacts);
  }
  if (preference === "selected_or_approved") {
    return match(session.approvedArtifacts) ?? match(session.selectedArtifacts);
  }
  return match(session.generatedArtifacts);
}

/**
 * Extra session refs for assembled-deck / deck-refinement families.
 * Driven by presentationArtifactFamily — never phaseId string equality.
 *
 * Roles are supplied explicitly and match the upstream phase contracts:
 *   storyline  → approval.required     → approved
 *   design-system / design-route → selection-gated → selected
 * They are not auto-derived here because full-deck's declared dependencies do
 * not include those artifactKeys (design-system may be pinned under select or
 * design-routes). Changing that requires a presentation contract expansion —
 * out of scope for dependency-role boundary closure.
 */
function presentationFamilyAdditionalRefs(
  session: CdfSessionState,
  presentationArtifactFamily: string | undefined,
): Array<{
  ref: CdfSessionArtifactRef;
  required: boolean;
  requiredRole: CdfDependencyRequiredRole;
}> {
  if (
    presentationArtifactFamily !== "presentation.deck" &&
    presentationArtifactFamily !== "presentation.refinement"
  ) {
    return [];
  }
  const extra: Array<{
    ref: CdfSessionArtifactRef;
    required: boolean;
    requiredRole: CdfDependencyRequiredRole;
  }> = [];

  const storyline = findByArtifactKeyForRole(
    session,
    PRESENTATION_ARTIFACT_KEYS.storyline,
    "approved",
  );
  if (storyline) {
    extra.push({ ref: storyline, required: false, requiredRole: "approved" });
  }

  const designSystem = findByArtifactKeyForRole(
    session,
    PRESENTATION_ARTIFACT_KEYS.designSystem,
    "selected",
  );
  if (designSystem) {
    extra.push({
      ref: designSystem,
      required: true,
      requiredRole: "selected",
    });
  }

  const designRoute = findByArtifactKeyForRole(
    session,
    PRESENTATION_ARTIFACT_KEYS.designRoute,
    "selected",
  );
  if (designRoute) {
    extra.push({
      ref: designRoute,
      required: false,
      requiredRole: "selected",
    });
  }

  return extra;
}

/** Soft-skip gates that never emit cdfart_* under modality none / config_choice. */
function isNonArtifactGatePhase(depPhase: {
  generationModality: string;
  artifact: { artifactType: string };
}): boolean {
  return (
    depPhase.generationModality === "none" ||
    depPhase.artifact.artifactType === "none" ||
    depPhase.artifact.artifactType === "config_choice"
  );
}

export function resolveUpstreamArtifactsForPhase(
  input: ResolveUpstreamArtifactsInput,
): ResolveUpstreamArtifactsResult {
  const canonical = resolveCdfCanonicalService(input.serviceId);
  if (!canonical) {
    return {
      ok: false,
      code: "CONTEXT_RESOLUTION_FAILED",
      message: `Unknown service: ${input.serviceId}`,
    };
  }
  const phase = canonical.phases.find((p) => p.phaseId === input.phaseId);
  if (!phase) {
    return {
      ok: false,
      code: "CONTEXT_RESOLUTION_FAILED",
      message: `Unknown phase "${input.phaseId}" for service "${input.serviceId}"`,
    };
  }

  const loader = input.loader ?? createArtifactContextLoader();
  const ownership = {
    organizationId: input.organizationId ?? input.session.organizationId,
    projectId: input.projectId ?? input.session.projectId,
  };

  const upstream: UpstreamArtifactContext[] = [];
  const skippedOptional: UpstreamOptionalSkip[] = [];
  const seen = new Set<string>();

  const pushUnique = (u: UpstreamArtifactContext) => {
    const k = `${u.artifactId}@${u.version}`;
    if (seen.has(k)) return;
    seen.add(k);
    upstream.push(u);
  };

  const depsResult = tryResolveCdfPhaseDependencies(
    input.serviceId,
    input.phaseId,
    phase,
  );
  if (!depsResult.ok) {
    return {
      ok: false,
      code: "DEPENDENCY_CONTRACT_INVALID",
      message: depsResult.message,
      details: {
        ...(depsResult.details ?? {}),
        dependencyContractCode: depsResult.code,
      },
    };
  }
  const resolvedDeps = depsResult.dependencies;

  for (const dep of phase.dependencies) {
    const required = dep.required !== false;
    const depPhase = canonical.phases.find((p) => p.phaseId === dep.phaseId);

    // Inactive (e.g. contract_only) dependencies: optional → skip; required → fail.
    if (depPhase && depPhase.implementationStatus !== "active") {
      if (!required) {
        skippedOptional.push({
          phaseId: dep.phaseId,
          artifactKey:
            typeof dep.artifactKey === "string" ? dep.artifactKey : undefined,
          reason: "inactive_optional_dependency",
        });
        continue;
      }
      return {
        ok: false,
        code: "DEPENDENCY_CONTRACT_INVALID",
        message: `Required dependency phase "${dep.phaseId}" is not active (implementationStatus=${depPhase.implementationStatus})`,
        details: {
          phaseId: input.phaseId,
          dependencyPhaseId: dep.phaseId,
          implementationStatus: depPhase.implementationStatus,
        },
      };
    }

    const artifactKey =
      typeof dep.artifactKey === "string" ? dep.artifactKey : undefined;

    const resolved = resolvedDeps.find((d) => d.phaseId === dep.phaseId);
    if (!resolved) {
      return {
        ok: false,
        code: "DEPENDENCY_CONTRACT_INVALID",
        message: `Missing resolved dependency contract for phase "${dep.phaseId}"`,
        details: { phaseId: input.phaseId, dependencyPhaseId: dep.phaseId },
      };
    }
    const requiredRole = resolved.requiredRole;
    const rolePreference = resolved.rolePreference;

    const ref = findSessionRef(
      input.session,
      dep.phaseId,
      artifactKey,
      rolePreference,
    );
    if (!ref) {
      // Config/gate phases often have no cdfart_* — soft-skip when optional or gate.
      if (depPhase && isNonArtifactGatePhase(depPhase)) {
        if (!required) {
          skippedOptional.push({
            phaseId: dep.phaseId,
            artifactKey,
            reason: "gate_or_config_no_artifact",
          });
        }
        // Required gate without pin: legacy selected[]/approved[] may still
        // exist; generation context does not invent from notes — soft continue
        // so structured deps remain the fail-closed path.
        continue;
      }
      if (required) {
        // Diagnostic only — never used to satisfy the dependency.
        const generatedOnly = Boolean(
          input.session.generatedArtifacts?.find((r) =>
            refsMatchPhaseAndKey(r, dep.phaseId, artifactKey),
          ),
        );
        try {
          console.info(
            JSON.stringify({
              scope: "cdf.generation_context",
              event: "dependency_not_satisfied",
              sessionId: input.session.sessionId,
              sessionVersion: input.session.sessionVersion,
              phaseId: input.phaseId,
              dependencyPhaseId: dep.phaseId,
              artifactKey,
              requiredRole,
              rolePreference,
              generatedOnlyPresent: generatedOnly,
              availableGeneratedArtifacts: (
                input.session.generatedArtifacts ?? []
              ).map((r) => ({
                phaseId: r.phaseId,
                artifactKey: r.artifactKey,
                exact: `${r.artifactId}@${r.version}`,
              })),
              availableSelectedArtifacts: (
                input.session.selectedArtifacts ?? []
              ).map((r) => ({
                phaseId: r.phaseId,
                artifactKey: r.artifactKey,
                exact: `${r.artifactId}@${r.version}`,
              })),
              availableApprovedArtifacts: (
                input.session.approvedArtifacts ?? []
              ).map((r) => ({
                phaseId: r.phaseId,
                artifactKey: r.artifactKey,
                exact: `${r.artifactId}@${r.version}`,
              })),
              ts: new Date().toISOString(),
            }),
          );
        } catch {
          // ignore
        }
        return {
          ok: false,
          code: "DEPENDENCY_NOT_SATISFIED",
          message: generatedOnly
            ? `Missing ${requiredRole} canonical artifact for required dependency phase "${dep.phaseId}" (generated-only is insufficient)`
            : `Missing exact canonical artifact for required dependency phase "${dep.phaseId}" (role=${requiredRole})`,
          details: {
            phaseId: input.phaseId,
            dependencyPhaseId: dep.phaseId,
            artifactKey,
            requiredRole,
            rolePreference,
            generatedOnlyPresent: generatedOnly,
          },
        };
      }
      skippedOptional.push({
        phaseId: dep.phaseId,
        artifactKey,
        reason: "optional_session_ref_missing",
      });
      continue;
    }

    try {
      pushUnique({
        ...loadUpstreamFromSessionRef({
          loader,
          ref,
          required,
          organizationId: ownership.organizationId,
          projectId: ownership.projectId,
        }),
        ...(resolved.artifactProjectionMode
          ? { artifactProjectionMode: resolved.artifactProjectionMode }
          : {}),
      });
    } catch (err) {
      if (err instanceof CdfArtifactError) {
        if (!required) {
          skippedOptional.push({
            phaseId: dep.phaseId,
            artifactKey,
            artifactId: ref.artifactId,
            version: ref.version,
            reason: err.artifactCode,
          });
          continue;
        }
        return {
          ok: false,
          code:
            err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND"
              ? "ARTIFACT_VERSION_NOT_FOUND"
              : err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID"
                ? "ARTIFACT_NOT_FOUND"
                : "ARTIFACT_NOT_FOUND",
          message: err.message,
          details: {
            artifactId: ref.artifactId,
            version: ref.version,
            artifactCode: err.artifactCode,
          },
        };
      }
      if (err instanceof CdfDependencyContractError) {
        return {
          ok: false,
          code: "DEPENDENCY_CONTRACT_INVALID",
          message: err.message,
          details: { ...(err.details ?? {}), code: err.code },
        };
      }
      throw err;
    }
  }

  // Assembled-deck / deck-refinement families need design-system by artifactKey.
  const family = phase.presentationArtifactFamily;
  if (
    family === "presentation.deck" ||
    family === "presentation.refinement"
  ) {
    const extras = presentationFamilyAdditionalRefs(input.session, family);
    if (
      !extras.some(
        (e) => e.ref.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem,
      )
    ) {
      return {
        ok: false,
        code: "DEPENDENCY_NOT_SATISFIED",
        message:
          "Missing exact presentation.design-system version required for assembled-deck generation",
        details: {
          phaseId: input.phaseId,
          presentationArtifactFamily: family,
        },
      };
    }
    for (const extra of extras) {
      try {
        pushUnique(
          loadUpstreamFromSessionRef({
            loader,
            ref: extra.ref,
            required: extra.required,
            organizationId: ownership.organizationId,
            projectId: ownership.projectId,
            role:
              extra.ref.artifactKey === PRESENTATION_ARTIFACT_KEYS.designSystem
                ? "design_reference"
                : undefined,
          }),
        );
      } catch (err) {
        if (err instanceof CdfArtifactError) {
          if (!extra.required) {
            skippedOptional.push({
              phaseId: extra.ref.phaseId,
              artifactKey: extra.ref.artifactKey,
              artifactId: extra.ref.artifactId,
              version: extra.ref.version,
              reason: err.artifactCode,
            });
            continue;
          }
          return {
            ok: false,
            code:
              err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND"
                ? "ARTIFACT_VERSION_NOT_FOUND"
                : "ARTIFACT_NOT_FOUND",
            message: err.message,
            details: {
              artifactId: extra.ref.artifactId,
              version: extra.ref.version,
              artifactCode: err.artifactCode,
            },
          };
        }
        if (extra.required) throw err;
      }
    }
  }

  return { ok: true, upstream, loader, skippedOptional };
}
