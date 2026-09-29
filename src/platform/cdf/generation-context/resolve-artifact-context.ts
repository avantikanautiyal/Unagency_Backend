/**
 * Phase 8 — Artifact Context Rehydration (canonical generation).
 *
 * Extends Phase 2 ArtifactContextLoader + resolveUpstreamArtifactsForPhase.
 * Exact ArtifactVersion only. Never latest/HEAD. Never approval-note fallback.
 */

import type { GenerationReferenceResolutionResult } from "../../ai/reference-resolution";
import { CdfArtifactError } from "../artifacts/errors";
import type { CdfSessionArtifactRef, CdfSessionState } from "../types";
import {
  createArtifactContextLoader,
  loadUpstreamFromSessionRef,
  toUpstreamArtifactContext,
  type ArtifactContextLoader,
} from "./artifact-context-loader";
import {
  fingerprintArtifactDataForObservability,
  summarizeUpstreamForObservability,
} from "./hash";
import {
  resolveUpstreamArtifactsForPhase,
  type ResolveUpstreamArtifactsResult,
} from "./resolve-dependencies";
import type {
  GenerationContextErrorCode,
  UpstreamArtifactContext,
} from "./types";
import { fnv1a32 } from "../canonical";

export type ArtifactContextSkip = {
  readonly phaseId?: string;
  readonly artifactKey?: string;
  readonly artifactId?: string;
  readonly version?: number;
  readonly reason: string;
  readonly required: boolean;
};

export type ArtifactContextObservability = {
  readonly artifactContextApplied: boolean;
  readonly requiredArtifactCount: number;
  readonly optionalArtifactCount: number;
  readonly loadedArtifactCount: number;
  readonly missingArtifactCount: number;
  readonly skippedOptionalCount: number;
  readonly artifactContextHash: string;
  readonly artifactIds: readonly string[];
  readonly artifactVersions: readonly string[];
  readonly artifactKeys: readonly string[];
  readonly artifactPhases: readonly string[];
  readonly loadedFromReferences: number;
  readonly loaderCacheSize: number;
};

export type ArtifactContextRehydrationResult =
  | {
      ok: true;
      upstream: UpstreamArtifactContext[];
      loader: ArtifactContextLoader;
      skippedOptional: readonly ArtifactContextSkip[];
      observability: ArtifactContextObservability;
    }
  | {
      ok: false;
      code: GenerationContextErrorCode;
      message: string;
      details?: Record<string, unknown>;
      observability?: Partial<ArtifactContextObservability>;
    };

function allSessionPins(
  session: CdfSessionState,
): CdfSessionArtifactRef[] {
  return [
    ...(session.approvedArtifacts ?? []),
    ...(session.selectedArtifacts ?? []),
    ...(session.generatedArtifacts ?? []),
  ];
}

/** Exact pin or same artifactId already authorized in session. */
export function isSessionAuthorizedArtifactId(
  session: CdfSessionState,
  artifactId: string,
): boolean {
  return allSessionPins(session).some((r) => r.artifactId === artifactId);
}

export function computeArtifactContextHash(
  upstream: readonly UpstreamArtifactContext[],
): string {
  const parts = upstream
    .slice()
    .sort((a, b) =>
      `${a.artifactId}@${a.version}`.localeCompare(`${b.artifactId}@${b.version}`),
    )
    .map(
      (u) =>
        `${u.artifactId}|${u.version}|${u.artifactKey}|${u.phaseId}|${fingerprintArtifactDataForObservability(u.data)}`,
    );
  return fnv1a32(parts.join("\n"));
}

export function buildArtifactContextObservability(input: {
  upstream: readonly UpstreamArtifactContext[];
  skippedOptional?: readonly ArtifactContextSkip[];
  loadedFromReferences?: number;
  loaderCacheSize?: number;
  applied?: boolean;
}): ArtifactContextObservability {
  const upstream = input.upstream;
  const requiredArtifactCount = upstream.filter((u) => u.required).length;
  const optionalArtifactCount = upstream.filter((u) => !u.required).length;
  const skipped = input.skippedOptional ?? [];
  return {
    artifactContextApplied: input.applied !== false && upstream.length > 0,
    requiredArtifactCount,
    optionalArtifactCount,
    loadedArtifactCount: upstream.length,
    missingArtifactCount: skipped.filter((s) => s.required).length,
    skippedOptionalCount: skipped.filter((s) => !s.required).length,
    artifactContextHash: computeArtifactContextHash(upstream),
    artifactIds: upstream.map((u) => u.artifactId),
    artifactVersions: upstream.map((u) => `${u.artifactId}@${u.version}`),
    artifactKeys: upstream.map((u) => u.artifactKey),
    artifactPhases: upstream.map((u) => u.phaseId),
    loadedFromReferences: input.loadedFromReferences ?? 0,
    loaderCacheSize: input.loaderCacheSize ?? 0,
  };
}

/**
 * Load exact ArtifactVersion pins for a CDF phase.
 * Wrapper around resolveUpstreamArtifactsForPhase with observability.
 */
export function resolveArtifactContextForGeneration(input: {
  session: CdfSessionState;
  serviceId: string;
  phaseId: string;
  organizationId?: string;
  projectId?: string;
  loader?: ArtifactContextLoader;
}): ArtifactContextRehydrationResult {
  const loader = input.loader ?? createArtifactContextLoader();
  const result: ResolveUpstreamArtifactsResult = resolveUpstreamArtifactsForPhase({
    ...input,
    loader,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      details: result.details,
      observability: {
        artifactContextApplied: false,
        loadedArtifactCount: 0,
        missingArtifactCount: 1,
      },
    };
  }

  const skippedOptional: ArtifactContextSkip[] = result.skippedOptional.map(
    (s) => ({
      ...s,
      required: false,
    }),
  );

  const observability = buildArtifactContextObservability({
    upstream: result.upstream,
    skippedOptional,
    loaderCacheSize: result.loader.cacheSize(),
  });

  return {
    ok: true,
    upstream: result.upstream,
    loader: result.loader,
    skippedOptional,
    observability,
  };
}

/**
 * Phase 6 → Phase 8: if a deterministic reference points at an authorized
 * exact version not yet in upstream, rehydrate it (optional contextual unless
 * already required). Never loads unauthorized artifactIds.
 */
export function rehydrateReferencedArtifacts(input: {
  session: CdfSessionState;
  upstream: UpstreamArtifactContext[];
  referenceResolution?: GenerationReferenceResolutionResult;
  loader: ArtifactContextLoader;
  organizationId?: string;
  projectId?: string;
}):
  | {
      ok: true;
      upstream: UpstreamArtifactContext[];
      loadedFromReferences: number;
      skipped: ArtifactContextSkip[];
    }
  | {
      ok: false;
      code: GenerationContextErrorCode;
      message: string;
      details?: Record<string, unknown>;
    } {
  const refs = input.referenceResolution?.references ?? [];
  if (!refs.length) {
    return {
      ok: true,
      upstream: input.upstream,
      loadedFromReferences: 0,
      skipped: [],
    };
  }

  const seen = new Set(
    input.upstream.map((u) => `${u.artifactId}@${u.version}`),
  );
  const upstream = [...input.upstream];
  const skipped: ArtifactContextSkip[] = [];
  let loadedFromReferences = 0;

  for (const ref of refs) {
    if (ref.status !== "exact" && ref.status !== "deterministic") continue;
    if (!ref.artifactId || ref.version == null) continue;
    const key = `${ref.artifactId}@${ref.version}`;
    if (seen.has(key)) continue;

    if (!isSessionAuthorizedArtifactId(input.session, ref.artifactId)) {
      // Do not project-wide lookup. Record skip — conversational ambiguity stays unresolved.
      skipped.push({
        artifactId: ref.artifactId,
        version: ref.version,
        reason: "unauthorized_or_not_in_session_pins",
        required: false,
        artifactKey: ref.artifactKey,
        phaseId: ref.phaseId,
      });
      continue;
    }

    const pin =
      allSessionPins(input.session).find(
        (r) => r.artifactId === ref.artifactId && r.version === ref.version,
      ) ??
      allSessionPins(input.session).find((r) => r.artifactId === ref.artifactId);

    try {
      const record = input.loader.loadExact({
        artifactId: ref.artifactId,
        version: ref.version,
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      const ctx = toUpstreamArtifactContext({
        record,
        phaseId: ref.phaseId ?? pin?.phaseId ?? "referenced",
        sessionRole: pin?.role ?? "generated",
        required: false,
      });
      upstream.push(ctx);
      seen.add(key);
      loadedFromReferences += 1;
    } catch (err) {
      if (err instanceof CdfArtifactError) {
        if (err.artifactCode === "ARTIFACT_OWNERSHIP_INVALID") {
          return {
            ok: false,
            code: "ARTIFACT_NOT_FOUND",
            message: err.message,
            details: {
              artifactId: ref.artifactId,
              version: ref.version,
              artifactCode: err.artifactCode,
            },
          };
        }
        skipped.push({
          artifactId: ref.artifactId,
          version: ref.version,
          reason: err.artifactCode,
          required: false,
          artifactKey: ref.artifactKey,
          phaseId: ref.phaseId,
        });
        continue;
      }
      throw err;
    }
  }

  return { ok: true, upstream, loadedFromReferences, skipped };
}

/** Map CdfArtifactError → generation context failure (exact version / ownership). */
export function mapArtifactErrorToGenerationFailure(
  err: CdfArtifactError,
  pin?: { artifactId: string; version: number },
): {
  code: GenerationContextErrorCode;
  message: string;
  details: Record<string, unknown>;
} {
  const code: GenerationContextErrorCode =
    err.artifactCode === "ARTIFACT_VERSION_NOT_FOUND"
      ? "ARTIFACT_VERSION_NOT_FOUND"
      : "ARTIFACT_NOT_FOUND";
  return {
    code,
    message: err.message,
    details: {
      artifactId: pin?.artifactId,
      version: pin?.version,
      artifactCode: err.artifactCode,
    },
  };
}

export function summarizeArtifactContextForTrace(
  obs: ArtifactContextObservability,
): Record<string, unknown> {
  return {
    artifactContextApplied: obs.artifactContextApplied,
    requiredArtifactCount: obs.requiredArtifactCount,
    optionalArtifactCount: obs.optionalArtifactCount,
    loadedArtifactCount: obs.loadedArtifactCount,
    missingArtifactCount: obs.missingArtifactCount,
    skippedOptionalCount: obs.skippedOptionalCount,
    artifactContextHash: obs.artifactContextHash,
    artifactVersions: obs.artifactVersions,
    artifactKeys: obs.artifactKeys,
    artifactPhases: obs.artifactPhases,
    loadedFromReferences: obs.loadedFromReferences,
    loaderCacheSize: obs.loaderCacheSize,
  };
}

export {
  createArtifactContextLoader,
  loadUpstreamFromSessionRef,
  toUpstreamArtifactContext,
  summarizeUpstreamForObservability,
};
