/**
 * Resolve user-selected generation continuation visual → provider image bytes.
 *
 * Generic visual continuity: when the user clicked "Use this creative", the
 * downstream visual phase must receive the exact selected raster as an
 * authoritative multimodal reference — not text-only prose.
 *
 * Does NOT rewrite outputKind to edited_image (that is visual-modify only).
 * Does NOT invent a new creative direction when bytes cannot be resolved —
 * fail closed with UPSTREAM_VISUAL_REFERENCE_UNRESOLVED.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { ExecutionArtifactRef } from "../../api/contracts";
import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import {
  resolveArtifactReferenceFromStore,
  type ResolvedArtifactReference,
} from "../../collaboration/conversational-task-intelligence/artifact-reference-bridge";
import type { CdfGenerationContinuationSelection } from "../../cdf/types";
import {
  resolveCanonicalArtifactVisualBytes,
} from "../../cdf/generation-context/canonical-visual-bytes";

const CONTINUATION_RELATIONSHIP = "user_selected_generation_reference";
/** Authoritative source subject — not identity_mark (subordinate signature). */
const CONTINUATION_REFERENCE_ROLE = "subject_reference" as const;

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function readContinuationFromMetadata(
  meta: Readonly<Record<string, unknown>>,
): CdfGenerationContinuationSelection | undefined {
  const stamped = asRecord(meta.cdfGenerationContinuation);
  if (
    stamped &&
    stamped.selectionKind === "generation_continuation" &&
    typeof stamped.visualArtifactId === "string" &&
    stamped.visualArtifactId.trim() &&
    typeof stamped.executionId === "string" &&
    stamped.executionId.trim()
  ) {
    return stamped as unknown as CdfGenerationContinuationSelection;
  }

  const visualArtifactId =
    typeof meta.cdfContinuationVisualArtifactId === "string"
      ? meta.cdfContinuationVisualArtifactId.trim()
      : "";
  const executionId =
    typeof meta.cdfContinuationExecutionId === "string"
      ? meta.cdfContinuationExecutionId.trim()
      : typeof meta.parentExecutionId === "string"
        ? meta.parentExecutionId.trim()
        : "";
  if (!visualArtifactId || !executionId) return undefined;

  const rawIds = Array.isArray(meta.cdfContinuationRawArtifactIds)
    ? meta.cdfContinuationRawArtifactIds.map(String)
    : [];
  const isDiagnosticRaw =
    meta.cdfContinuationIsDiagnosticRaw === true ||
    rawIds.includes(visualArtifactId) ||
    (visualArtifactId.startsWith("art_") &&
      !visualArtifactId.startsWith("cdfart_"));

  return {
    selectionKind: "generation_continuation",
    sourcePhaseId:
      typeof meta.cdfContinuationSourcePhaseId === "string"
        ? meta.cdfContinuationSourcePhaseId
        : typeof meta.cdfPriorPhaseId === "string"
          ? meta.cdfPriorPhaseId
          : "unknown",
    executionId,
    visualArtifactId,
    isDiagnosticRaw,
    ...(typeof meta.cdfContinuationFanoutTargetId === "string"
      ? {
          generationFanoutTargetId: meta.cdfContinuationFanoutTargetId.trim(),
        }
      : {}),
  };
}

function assetAlreadyBound(
  meta: Readonly<Record<string, unknown>>,
  visualArtifactId: string,
): boolean {
  const assets = Array.isArray(meta.assets) ? meta.assets : [];
  for (const a of assets) {
    const rec = asRecord(a);
    if (!rec) continue;
    const id =
      (typeof rec.assetId === "string" && rec.assetId.trim()) ||
      (typeof rec.id === "string" && rec.id.trim()) ||
      "";
    const hasBytes = Boolean(
      (typeof rec.url === "string" && rec.url.trim()) ||
        (typeof rec.storageRef === "string" && rec.storageRef.trim()),
    );
    if (id === visualArtifactId && hasBytes) return true;
    if (
      rec.relationshipLabel === CONTINUATION_RELATIONSHIP &&
      hasBytes &&
      (!id || id === visualArtifactId)
    ) {
      return true;
    }
  }
  return false;
}

function inlineArtifactFromStore(
  artifactStore: Map<string, ExecutionArtifactRef[]> | undefined,
  artifactId: string,
  preferredExecutionId?: string,
): { artifact?: ExecutionArtifactRef; executionId?: string } {
  if (!artifactStore) return {};
  if (preferredExecutionId) {
    const list = artifactStore.get(preferredExecutionId);
    const found = list?.find((a) => a.artifactId === artifactId);
    if (found) {
      return { artifact: found, executionId: preferredExecutionId };
    }
  }
  for (const [executionId, artifacts] of artifactStore.entries()) {
    const found = artifacts.find((a) => a.artifactId === artifactId);
    if (found) return { artifact: found, executionId };
  }
  return {};
}

async function resolveCanonicalVisualBytes(input: {
  readonly visualArtifactId: string;
  readonly visualArtifactVersion?: number;
  readonly organizationId: string;
  readonly projectId?: string;
}): Promise<ResolvedArtifactReference | undefined> {
  if (
    input.visualArtifactVersion == null ||
    !Number.isInteger(input.visualArtifactVersion)
  ) {
    return undefined;
  }
  const result = await resolveCanonicalArtifactVisualBytes({
    artifactId: input.visualArtifactId,
    artifactVersion: input.visualArtifactVersion,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  return result.ok ? result.resolved : undefined;
}

/**
 * Attach continuation visual as multimodal source without switching to image.edit.
 */
export function attachContinuationVisualToExecutionMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly continuation: CdfGenerationContinuationSelection;
  readonly resolved: ResolvedArtifactReference;
}): Record<string, unknown> {
  const existingAssets = Array.isArray(input.metadata.assets)
    ? [...input.metadata.assets]
    : [];
  const assetRecord: Record<string, unknown> = {
    ...input.resolved.providerInput,
    assetId: input.continuation.visualArtifactId,
    organizationId: input.resolved.organizationId,
    mimeType: input.resolved.mimeType,
    semanticReferenceRole: CONTINUATION_REFERENCE_ROLE,
    explicitRole: CONTINUATION_REFERENCE_ROLE,
    referenceRoleResolutionSource: "explicit_role",
    relationshipLabel: CONTINUATION_RELATIONSHIP,
    referenceAuthority: "authoritative",
    referenceBehavior: "source_asset",
  };

  // Drop any prior continuation stamp for the same id to avoid duplicates.
  const filtered = existingAssets.filter((a) => {
    const rec = asRecord(a);
    if (!rec) return true;
    const id =
      (typeof rec.assetId === "string" && rec.assetId.trim()) ||
      (typeof rec.id === "string" && rec.id.trim()) ||
      "";
    if (id === input.continuation.visualArtifactId) return false;
    if (rec.relationshipLabel === CONTINUATION_RELATIONSHIP) return false;
    return true;
  });

  return {
    ...input.metadata,
    referenceInputPresent: true,
    cdfContinuationVisualResolved: true,
    cdfContinuationVisualArtifactId: input.continuation.visualArtifactId,
    cdfContinuationExecutionId: input.continuation.executionId,
    cdfContinuationIsDiagnosticRaw: input.continuation.isDiagnosticRaw === true,
    ...(input.continuation.generationFanoutTargetId
      ? {
          cdfContinuationFanoutTargetId:
            input.continuation.generationFanoutTargetId,
        }
      : {}),
    assets: [...filtered, assetRecord],
  };
}

export async function applyGenerationContinuationVisualPrepass(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly projectId?: string;
  readonly artifactsRepo?: IArtifactRepository;
  readonly blobStorage?: IBlobStorage;
  readonly artifactStore?: Map<string, ExecutionArtifactRef[]>;
  /**
   * When true (default for visual emission phases), missing bytes fail closed.
   * Callers may pass false only for non-visual phases that stamp continuation IDs.
   */
  readonly requireResolvedVisual?: boolean;
}): Promise<
  Result<{
    readonly metadata: Record<string, unknown>;
    readonly continuation?: CdfGenerationContinuationSelection;
    readonly resolved: boolean;
  }>
> {
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  let continuation = readContinuationFromMetadata(meta);

  // Session fallback after hydrate — exact persisted selection, never "latest leaf".
  if (!continuation) {
    const sessionId =
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId.trim() : "";
    if (sessionId) {
      try {
        const { getCdfSession } = await import("../../cdf");
        const session = getCdfSession(sessionId);
        const list = session?.generationContinuations ?? [];
        if (list.length > 0) {
          continuation = list[list.length - 1];
        }
      } catch {
        // Session optional in constrained hosts.
      }
    }
  }

  if (!continuation) {
    return success({ metadata: meta, resolved: false });
  }

  const visualArtifactId = continuation.visualArtifactId.trim();
  const requireResolved = input.requireResolvedVisual !== false;

  console.info(
    JSON.stringify({
      scope: "cdf.generation_continuation",
      event: "SELECTED_UPSTREAM_VISUAL",
      artifactKey: continuation.sourceArtifactKey ?? null,
      artifactId: visualArtifactId,
      artifactVersion: continuation.visualArtifactVersion ?? null,
      choiceId: continuation.upstreamChoiceId ?? null,
      executionId: continuation.executionId,
      generationFanoutTargetId: continuation.generationFanoutTargetId ?? null,
      sourcePhaseId: continuation.sourcePhaseId,
      isDiagnosticRaw: continuation.isDiagnosticRaw === true,
      presentationEligibilityStatus:
        continuation.presentationEligibilityStatus ?? null,
      alreadyBound: assetAlreadyBound(meta, visualArtifactId),
    }),
  );

  if (assetAlreadyBound(meta, visualArtifactId)) {
    return success({
      metadata: {
        ...meta,
        cdfContinuationVisualResolved: true,
        cdfGenerationContinuation: continuation,
      },
      continuation,
      resolved: true,
    });
  }

  let resolved: ResolvedArtifactReference | undefined;

  const isRaw =
    continuation.isDiagnosticRaw === true ||
    (visualArtifactId.startsWith("art_") &&
      !visualArtifactId.startsWith("cdfart_"));

  if (isRaw) {
    const inlineLookup = inlineArtifactFromStore(
      input.artifactStore,
      visualArtifactId,
      continuation.executionId,
    );
    resolved = await resolveArtifactReferenceFromStore({
      artifactsRepo: input.artifactsRepo,
      blobStorage: input.blobStorage,
      organizationId: input.organizationId,
      artifactId: visualArtifactId,
      inlineArtifact: inlineLookup.artifact,
      executionId: inlineLookup.executionId ?? continuation.executionId,
    });
  } else {
    resolved = await resolveCanonicalVisualBytes({
      visualArtifactId,
      visualArtifactVersion: continuation.visualArtifactVersion,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    // Fallback: some hosts may still have the leaf as art_* under execution store
    // even when the continuation pin is cdfart_* — never substitute a different id.
    if (!resolved) {
      const inlineLookup = inlineArtifactFromStore(
        input.artifactStore,
        visualArtifactId,
        continuation.executionId,
      );
      resolved = await resolveArtifactReferenceFromStore({
        artifactsRepo: input.artifactsRepo,
        blobStorage: input.blobStorage,
        organizationId: input.organizationId,
        artifactId: visualArtifactId,
        inlineArtifact: inlineLookup.artifact,
        executionId: inlineLookup.executionId ?? continuation.executionId,
      });
    }
  }

  if (!resolved) {
    console.info(
      JSON.stringify({
        scope: "cdf.generation_continuation",
        event: "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED",
        visualArtifactId,
        executionId: continuation.executionId,
        generationFanoutTargetId: continuation.generationFanoutTargetId ?? null,
        isDiagnosticRaw: isRaw,
        requireResolved,
      }),
    );
    if (requireResolved) {
      return failure(
        new ValidationError(
          `Required upstream selected visual '${visualArtifactId}' could not be resolved to image bytes for downstream generation.`,
          {
            reason: "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED",
            code: "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED",
            visualArtifactId,
            executionId: continuation.executionId,
            generationFanoutTargetId:
              continuation.generationFanoutTargetId ?? null,
            sourcePhaseId: continuation.sourcePhaseId,
            isDiagnosticRaw: isRaw,
          },
        ),
      );
    }
    return success({
      metadata: {
        ...meta,
        cdfGenerationContinuation: continuation,
        cdfContinuationVisualResolved: false,
      },
      continuation,
      resolved: false,
    });
  }

  const stamped = attachContinuationVisualToExecutionMetadata({
    metadata: {
      ...meta,
      cdfGenerationContinuation: continuation,
    },
    continuation,
    resolved,
  });

  console.info(
    JSON.stringify({
      scope: "cdf.generation_continuation",
      event: "UPSTREAM_SELECTED_VISUAL",
      referenceRole: CONTINUATION_REFERENCE_ROLE,
      authority: "authoritative",
      artifactId: visualArtifactId,
      executionId: continuation.executionId,
      generationFanoutTargetId: continuation.generationFanoutTargetId ?? null,
      resolved: true,
      bytes: true,
    }),
  );

  return success({
    metadata: stamped,
    continuation,
    resolved: true,
  });
}
