/**
 * M3C — Normalize generation output → validate M3B → persist via M3A.
 */

import { CdfArtifactError } from "../artifacts/errors";
import { createArtifactFromCandidate } from "../artifacts/candidate-boundary";
import { getArtifact, getArtifactVersion } from "../artifacts/repository";
import { storeGetIdempotency } from "../artifacts/store";
import {
  PRESENTATION_ARTIFACT_KEYS,
  type PresentationArtifactKey,
} from "../artifacts/presentation/keys";
import {
  isPackagingArtifactKey,
  type PackagingArtifactKey,
} from "../artifacts/packaging/keys";
import {
  isSocialMediaArtifactKey,
  type SocialMediaArtifactKey,
} from "../artifacts/social-media/keys";
import {
  normalizePresentationSource,
  normalizePresentationStoryline,
  normalizePresentationSlideContent,
  normalizePresentationDesignRoute,
  normalizePresentationDesignSystem,
  normalizePresentationDeck,
  normalizeToPackagingData,
  normalizeToSocialMediaData,
  normalizeGenericCanonicalData,
} from "./adapters";
import type { CdfArtifactType } from "../artifacts/types";
import { CdfGenerationArtifactError, generationArtifactError } from "./errors";
import { createCandidateId } from "./stable-ids";
import { assertGenerationContextNotStale } from "./stale";
import { resolveArtifactTarget } from "./target-resolution";
import type {
  GeneratedCandidate,
  IngestGenerationInput,
  IngestGenerationResult,
} from "./types";
import { acceptCandidatePayload } from "../generation-validation";

const PRESENTATION_KEY_SET = new Set<string>(
  Object.values(PRESENTATION_ARTIFACT_KEYS),
);

function isPresentationArtifactKey(key: string): key is PresentationArtifactKey {
  return PRESENTATION_KEY_SET.has(key);
}
function nowIso(): string {
  return new Date().toISOString();
}

function logIngest(meta: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      scope: "cdf.generation_artifact",
      ...meta,
      ts: nowIso(),
    }),
  );
}

export function normalizeToPresentationData(
  artifactKey: PresentationArtifactKey,
  raw: unknown,
  opts: {
    activeBriefId?: string;
    activeBriefVersion?: number;
    vaultAssetIds?: string[];
    sourceInputIds?: string[];
    designSystemRef?: { artifactId: string; version: number };
    designRouteRef?: { artifactId: string; version: number };
    routeIndex?: number;
  },
): Record<string, unknown> {
  switch (artifactKey) {
    case PRESENTATION_ARTIFACT_KEYS.source:
      return normalizePresentationSource(raw, opts) as unknown as Record<
        string,
        unknown
      >;
    case PRESENTATION_ARTIFACT_KEYS.storyline:
      return normalizePresentationStoryline(raw) as unknown as Record<
        string,
        unknown
      >;
    case PRESENTATION_ARTIFACT_KEYS.slideContent:
      return normalizePresentationSlideContent(raw) as unknown as Record<
        string,
        unknown
      >;
    case PRESENTATION_ARTIFACT_KEYS.designRoute:
      return normalizePresentationDesignRoute(raw, {
        routeIndex: opts.routeIndex,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case PRESENTATION_ARTIFACT_KEYS.designSystem:
      return normalizePresentationDesignSystem(raw, {
        designRouteRef: opts.designRouteRef,
      }) as unknown as Record<string, unknown>;
    case PRESENTATION_ARTIFACT_KEYS.deck: {
      if (!opts.designSystemRef) {
        throw generationArtifactError(
          "ARTIFACT_NORMALIZATION_FAILED",
          "presentation.deck requires exact designSystemRef",
        );
      }
      return normalizePresentationDeck(raw, {
        designSystemRef: opts.designSystemRef,
        routeIndex: opts.routeIndex,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    }
    default:
      throw generationArtifactError(
        "ARTIFACT_TARGET_UNRESOLVED",
        `No adapter for ${String(artifactKey)}`,
      );
  }
}

/** Normalize provider output → Class-A deep overlay OR contract-generic canonical data. */
export function normalizeGenerationToCanonicalData(
  artifactKey: string,
  raw: unknown,
  opts: {
    activeBriefId?: string;
    activeBriefVersion?: number;
    vaultAssetIds?: string[];
    sourceInputIds?: string[];
    designSystemRef?: { artifactId: string; version: number };
    designRouteRef?: { artifactId: string; version: number };
    routeIndex?: number;
    packagingRefs?: IngestGenerationInput["packagingRefs"];
    socialMediaRefs?: IngestGenerationInput["socialMediaRefs"];
    /** Required for generic (non–Class-A) keys — from resolveArtifactTarget. */
    artifactType?: CdfArtifactType;
  },
): Record<string, unknown> {
  if (isPackagingArtifactKey(artifactKey)) {
    return normalizeToPackagingData(artifactKey as PackagingArtifactKey, raw, {
      vaultAssetIds: opts.vaultAssetIds,
      ...(opts.packagingRefs ?? {}),
    });
  }
  if (isSocialMediaArtifactKey(artifactKey)) {
    return normalizeToSocialMediaData(
      artifactKey as SocialMediaArtifactKey,
      raw,
      {
        vaultAssetIds: opts.vaultAssetIds,
        ...(opts.socialMediaRefs ?? {}),
      },
    );
  }
  if (isPresentationArtifactKey(artifactKey)) {
    return normalizeToPresentationData(artifactKey, raw, opts);
  }
  if (!opts.artifactType) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      `Generic normalize requires artifactType for key "${artifactKey}"`,
    );
  }
  return normalizeGenericCanonicalData(
    { artifactKey, artifactType: opts.artifactType },
    raw,
    { vaultAssetIds: opts.vaultAssetIds },
  );
}

/**
 * Capture generation completion → normalize → M4 acceptance → canonical artifact.
 * Does not call AI. Does not render.
 * Shared acceptance boundary with M6: FAILED M4 never creates ArtifactVersion.
 */
export function ingestGenerationCompletion(
  input: IngestGenerationInput,
): IngestGenerationResult {
  if (input.rawOutput == null || input.rawOutput === "") {
    throw generationArtifactError(
      "GENERATION_OUTPUT_MISSING",
      "rawOutput is required",
    );
  }

  assertGenerationContextNotStale({
    sessionId: input.sessionId,
    expectedSessionVersion: input.expectedSessionVersion,
    activeBriefId: input.activeBriefId,
    activeBriefVersion: input.activeBriefVersion,
    contextHash: input.contextHash,
  });

  const target = resolveArtifactTarget({
    serviceId: input.serviceId,
    phaseId: input.phaseId,
    artifactKeyOverride: input.artifactKey,
  });

  if (
    target.artifactKey === PRESENTATION_ARTIFACT_KEYS.deck &&
    !input.designSystemRef
  ) {
    throw generationArtifactError(
      "ARTIFACT_DEPENDENCY_MISSING",
      "presentation.deck requires exact designSystemRef (artifactId+version); bootstrap forbidden",
    );
  }

  const requestId =
    input.requestId?.trim() ||
    (input.executionId
      ? `m3c:${input.executionId}:${target.artifactKey}${
          input.routeIndex != null ? `:r${input.routeIndex}` : ""
        }`
      : undefined);

  if (requestId) {
    const existing = storeGetIdempotency(requestId);
    if (existing) {
      const artifact = getArtifact(existing.artifactId, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      const version = getArtifactVersion(existing.artifactId, existing.version, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      });

      // Payload mismatch → typed conflict (do not silently accept different creative state).
      try {
        const normalizedProbe = normalizeGenerationToCanonicalData(
          target.artifactKey,
          input.rawOutput,
          {
            activeBriefId: input.activeBriefId,
            activeBriefVersion: input.activeBriefVersion,
            vaultAssetIds: input.vaultAssetIds,
            sourceInputIds: input.sourceInputIds,
            designSystemRef: input.designSystemRef,
            designRouteRef: input.designRouteRef,
            routeIndex: input.routeIndex,
            packagingRefs: input.packagingRefs,
            socialMediaRefs: input.socialMediaRefs,
            artifactType: target.artifactType,
          },
        );
        const prior = { ...(version.data as Record<string, unknown>) };
        const probe = { ...normalizedProbe };
        // Ignore provenance stamps that ingest may add after normalize.
        delete prior.sourceRefs;
        delete probe.sourceRefs;
        if (JSON.stringify(prior) !== JSON.stringify(probe)) {
          throw generationArtifactError(
            "GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT",
            `Idempotency key ${requestId} already bound to a different payload`,
            {
              requestId,
              artifactId: existing.artifactId,
              version: existing.version,
            },
          );
        }
      } catch (err) {
        if (err instanceof CdfGenerationArtifactError) throw err;
        throw err;
      }

      logIngest({
        status: "idempotent_replay",
        artifactKey: target.artifactKey,
        artifactId: existing.artifactId,
        artifactVersion: existing.version,
        executionId: input.executionId,
        cdfContextId: input.contextId,
        cdfContextHash: input.contextHash,
        activeBriefVersion: input.activeBriefVersion,
      });
      const candidate: GeneratedCandidate = {
        candidateId: createCandidateId(input.executionId, target.artifactKey),
        projectId: input.projectId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        serviceId: input.serviceId,
        phaseId: input.phaseId,
        artifactKey: target.artifactKey,
        artifactType: target.artifactType,
        sourceExecutionId: input.executionId,
        cdfSessionId: input.sessionId,
        cdfContextId: input.contextId,
        cdfContextHash: input.contextHash,
        activeBriefId: input.activeBriefId,
        activeBriefVersion: input.activeBriefVersion,
        sessionVersionAtGeneration: input.expectedSessionVersion,
        rawOutput: input.rawOutput,
        normalizedOutput: version.data,
        schemaVersion: target.schemaVersion,
        provenance: {
          sourceInputIds: input.sourceInputIds,
          parentArtifactId: input.parentArtifactId,
          parentVersion: input.parentVersion,
          sourceArtifacts: input.sourceArtifacts,
          vaultAssetIds: input.vaultAssetIds,
        },
        createdAt: version.createdAt,
      };
      return {
        candidate,
        artifactId: artifact.artifactId,
        artifactVersion: version.version,
        artifactKey: target.artifactKey,
        schemaId: target.schemaId,
        idempotentReplay: true,
      };
    }
  }

  let normalized: Record<string, unknown>;
  try {
    normalized = normalizeGenerationToCanonicalData(
      target.artifactKey,
      input.rawOutput,
      {
        activeBriefId: input.activeBriefId,
        activeBriefVersion: input.activeBriefVersion,
        vaultAssetIds: input.vaultAssetIds,
        sourceInputIds: input.sourceInputIds,
        designSystemRef: input.designSystemRef,
        designRouteRef: input.designRouteRef,
        routeIndex: input.routeIndex,
        packagingRefs: input.packagingRefs,
        socialMediaRefs: input.socialMediaRefs,
        artifactType: target.artifactType,
      },
    );
  } catch (err) {
    if (err instanceof CdfGenerationArtifactError) throw err;
    if (err instanceof CdfArtifactError) {
      throw generationArtifactError("ARTIFACT_SCHEMA_INVALID", err.message, {
        artifactCode: err.artifactCode,
      });
    }
    throw err;
  }

  if (
    input.upstreamArtifactRefs?.length ||
    input.contextId ||
    input.contextHash
  ) {
    const existingRefs =
      normalized.sourceRefs && typeof normalized.sourceRefs === "object"
        ? (normalized.sourceRefs as Record<string, unknown>)
        : {};
    normalized = {
      ...normalized,
      sourceRefs: {
        ...existingRefs,
        ...(input.activeBriefId
          ? { activeBriefId: input.activeBriefId }
          : {}),
        ...(input.activeBriefVersion != null
          ? { activeBriefVersion: input.activeBriefVersion }
          : {}),
        ...(input.contextId ? { contextId: input.contextId } : {}),
        ...(input.contextHash ? { contextHash: input.contextHash } : {}),
        ...(input.executionId ? { executionId: input.executionId } : {}),
        ...(input.upstreamArtifactRefs?.length
          ? { upstreamArtifactRefs: input.upstreamArtifactRefs }
          : {}),
      },
    };
  }

  const candidate: GeneratedCandidate = {
    candidateId: createCandidateId(input.executionId, target.artifactKey),
    projectId: input.projectId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    serviceId: input.serviceId,
    phaseId: input.phaseId,
    artifactKey: target.artifactKey,
    artifactType: target.artifactType,
    sourceExecutionId: input.executionId,
    cdfSessionId: input.sessionId,
    cdfContextId: input.contextId,
    cdfContextHash: input.contextHash,
    activeBriefId: input.activeBriefId,
    activeBriefVersion: input.activeBriefVersion,
    sessionVersionAtGeneration: input.expectedSessionVersion,
    rawOutput: input.rawOutput,
    normalizedOutput: normalized,
    schemaVersion: target.schemaVersion,
    provenance: {
      sourceInputIds: input.sourceInputIds,
      parentArtifactId: input.parentArtifactId,
      parentVersion: input.parentVersion,
      sourceArtifacts: input.sourceArtifacts,
      vaultAssetIds: input.vaultAssetIds,
    },
    createdAt: nowIso(),
  };

  let validationStatus: string | undefined;
  let validationId: string | undefined;

  if (input.requireAcceptanceGate !== false) {
    const gate = acceptCandidatePayload({
      candidateData: normalized,
      artifactKey: target.artifactKey,
      sessionId: input.sessionId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      contextId: input.contextId,
      contextHash: input.contextHash,
      activeBriefId: input.activeBriefId,
      activeBriefVersion: input.activeBriefVersion,
      expectedSessionVersion: input.expectedSessionVersion,
      expectedDesignSystemRef: input.designSystemRef,
      expectedDesignRouteRef: input.designRouteRef,
      expectedPackagingRefs: input.packagingRefs,
      ...(input.requirements ? { requirements: input.requirements } : {}),
    });
    validationStatus = gate.validation.status;
    validationId = gate.validation.validationId;
    if (!gate.accepted) {
      logIngest({
        status: "validation_failed",
        artifactKey: target.artifactKey,
        executionId: input.executionId,
        validationStatus: gate.validation.status,
        validationId: gate.validation.validationId,
        normalizationStatus: "ok",
      });
      throw generationArtifactError(
        "ARTIFACT_VALIDATION_FAILED",
        `M4 rejected candidate before persist: ${gate.validation.status}`,
        {
          validationStatus: gate.validation.status,
          validationId: gate.validation.validationId,
          acceptanceStatus: gate.status,
        },
      );
    }
  }

  try {
    const persisted = createArtifactFromCandidate({
      executionId: input.executionId,
      contextId: input.contextId,
      contextHash: input.contextHash,
      activeBriefId: input.activeBriefId,
      activeBriefVersion: input.activeBriefVersion,
      sessionVersion: input.expectedSessionVersion,
      sessionId: input.sessionId,
      serviceId: input.serviceId,
      phaseId: input.phaseId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      artifactKey: target.artifactKey,
      artifactType: target.artifactType,
      schemaVersion: target.schemaVersion,
      data: normalized,
      sourceInputIds: input.sourceInputIds,
      sourceArtifacts: input.sourceArtifacts,
      parentArtifactId: input.parentArtifactId,
      parentVersion: input.parentVersion,
      requestId,
    });

    if (
      input.executionId &&
      input.executionId === persisted.artifact.artifactId
    ) {
      throw generationArtifactError(
        "ARTIFACT_PERSIST_FAILED",
        "executionId collided with artifactId",
      );
    }

    logIngest({
      status: "ok",
      artifactKey: target.artifactKey,
      artifactId: persisted.artifact.artifactId,
      artifactVersion: persisted.version.version,
      executionId: input.executionId,
      cdfContextId: input.contextId,
      cdfContextHash: input.contextHash,
      activeBriefVersion: input.activeBriefVersion,
      normalizationStatus: "ok",
      validationStatus,
      validationId,
    });

    return {
      candidate,
      artifactId: persisted.artifact.artifactId,
      artifactVersion: persisted.version.version,
      artifactKey: target.artifactKey,
      schemaId: target.schemaId,
      validationStatus,
      validationId,
    };
  } catch (err) {
    if (err instanceof CdfGenerationArtifactError) throw err;
    if (err instanceof CdfArtifactError) {
      if (err.artifactCode === "ARTIFACT_IDEMPOTENCY_CONFLICT") {
        throw generationArtifactError(
          "GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT",
          err.message,
        );
      }
      if (err.artifactCode === "ARTIFACT_SCHEMA_INVALID") {
        throw generationArtifactError("ARTIFACT_SCHEMA_INVALID", err.message);
      }
      throw generationArtifactError("ARTIFACT_PERSIST_FAILED", err.message, {
        artifactCode: err.artifactCode,
      });
    }
    throw generationArtifactError(
      "ARTIFACT_PERSIST_FAILED",
      err instanceof Error ? err.message : "persist failed",
    );
  }
}
