/**
 * Phase 13 — Safe application-level context inspection (no sensitive bodies).
 */

import { createHash } from "crypto";
import type { ContextOrchestrationResult } from "../context-orchestrator";
import type { CanonicalModelRequest } from "../canonical-model-request";
import { CDF_CANONICAL_CONTEXT_META } from "../../cdf/generation-context/flag";

export type ConversationalContextInspection = {
  readonly inspected: true;
  readonly orchestratorApplied: boolean;
  readonly executionId?: string;
  readonly conversationIdPresent: boolean;
  readonly channelIdPresent: boolean;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly currentInstructionPresent: boolean;
  readonly currentInstructionLength: number;
  readonly currentInstructionHash?: string;
  readonly generationContextHash?: string;
  readonly workingMemoryTurnCount: number;
  readonly workingMemoryCharacterCount: number;
  readonly workingMemorySelectionMethod?: string;
  readonly referenceCount: number;
  readonly resolvedReferenceCount: number;
  readonly unresolvedReferenceCount: number;
  readonly ambiguousReferenceCount: number;
  readonly resolvedArtifactVersions: readonly string[];
  readonly upstreamArtifactCount: number;
  readonly upstreamArtifactVersions: readonly string[];
  readonly multimodalItemCount: number;
  readonly multimodalImageCount: number;
  readonly multimodalDocumentCount: number;
  readonly multimodalMappedCount: number;
  readonly multimodalOmittedCount: number;
  readonly requirementCount: number;
  readonly productionSpecPresent: boolean;
  readonly outputContractPresent: boolean;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly representationStrategy?: string;
  readonly contributors?: Readonly<Record<string, boolean>>;
  /** Explicitly never includes prompt/artifact/attachment bodies. */
  readonly sensitiveBodiesOmitted: true;
};

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function upstreamVersionsFromCmr(
  modelRequest: CanonicalModelRequest | undefined,
): string[] {
  if (!modelRequest) return [];
  const out: string[] = [];
  for (const m of modelRequest.messages) {
    for (const p of m.content) {
      if (p.type !== "structured" || p.name !== "upstream_artifact") continue;
      const data = p.data as { artifactId?: unknown; version?: unknown };
      const id = typeof data.artifactId === "string" ? data.artifactId : "";
      const v = typeof data.version === "number" ? data.version : undefined;
      if (id && v !== undefined) out.push(`${id}@${v}`);
    }
  }
  return out;
}

/**
 * Inspect assembled canonical conversational generation context safely.
 */
export function inspectConversationalGenerationContext(input: {
  readonly orchestration: ContextOrchestrationResult;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly representationStrategy?: string;
}): ConversationalContextInspection {
  const orch = input.orchestration;
  const meta = orch.ok ? orch.metadata : {};
  const applied = orch.ok && !orch.skipped && orch.orchestratorApplied;
  const modelRequest =
    orch.ok && !orch.skipped ? orch.modelRequest : undefined;
  const request = orch.ok && !orch.skipped ? orch.request : undefined;
  const instruction =
    request?.currentUserInstruction?.trim() ??
    (typeof meta.conversationalEffectiveInstruction === "string"
      ? meta.conversationalEffectiveInstruction.trim()
      : "");

  const refs = Array.isArray(meta.cdfCanonicalReferences)
    ? (meta.cdfCanonicalReferences as Array<Record<string, unknown>>)
    : [];
  const resolvedArtifactVersions = refs
    .filter((r) => {
      const status = String(r.status ?? "");
      return (
        status === "exact" ||
        status === "resolved" ||
        status === "resolved_exact" ||
        status === "resolved_session"
      );
    })
    .map((r) => {
      const id = typeof r.artifactId === "string" ? r.artifactId : "";
      const v = typeof r.version === "number" ? r.version : undefined;
      return id && v !== undefined ? `${id}@${v}` : "";
    })
    .filter(Boolean);

  const upstreamFromMeta = Array.isArray(meta.cdfArtifactVersions)
    ? (meta.cdfArtifactVersions as string[])
    : upstreamVersionsFromCmr(modelRequest);

  return {
    inspected: true,
    orchestratorApplied: Boolean(applied),
    executionId:
      typeof meta.apiExecutionId === "string"
        ? meta.apiExecutionId
        : typeof meta.executionId === "string"
          ? meta.executionId
          : undefined,
    conversationIdPresent:
      meta[CDF_CANONICAL_CONTEXT_META.conversationIdPresent] === true ||
      Boolean(
        typeof meta.conversationId === "string" && meta.conversationId.trim(),
      ),
    channelIdPresent:
      meta[CDF_CANONICAL_CONTEXT_META.channelIdPresent] === true ||
      Boolean(typeof meta.channelId === "string" && meta.channelId.trim()),
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId:
      typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    currentInstructionPresent: Boolean(instruction),
    currentInstructionLength: instruction.length,
    currentInstructionHash: instruction ? hashText(instruction) : undefined,
    generationContextHash:
      typeof meta[CDF_CANONICAL_CONTEXT_META.hash] === "string"
        ? (meta[CDF_CANONICAL_CONTEXT_META.hash] as string)
        : request?.generationContextHash,
    workingMemoryTurnCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.workingMemoryTurnCount] ?? 0,
    ),
    workingMemoryCharacterCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.workingMemoryCharacterCount] ?? 0,
    ),
    workingMemorySelectionMethod:
      typeof meta[CDF_CANONICAL_CONTEXT_META.workingMemorySelectionMethod] ===
      "string"
        ? (meta[
            CDF_CANONICAL_CONTEXT_META.workingMemorySelectionMethod
          ] as string)
        : undefined,
    referenceCount: refs.length,
    resolvedReferenceCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.resolvedReferenceCount] ?? 0,
    ),
    unresolvedReferenceCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.unresolvedReferenceCount] ?? 0,
    ),
    ambiguousReferenceCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.ambiguousReferenceCount] ?? 0,
    ),
    resolvedArtifactVersions,
    upstreamArtifactCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.upstreamCount] ??
        upstreamFromMeta.length,
    ),
    upstreamArtifactVersions: upstreamFromMeta,
    multimodalItemCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.multimodalItemCount] ?? 0,
    ),
    multimodalImageCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.multimodalImageCount] ?? 0,
    ),
    multimodalDocumentCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.multimodalDocumentCount] ?? 0,
    ),
    multimodalMappedCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.multimodalProviderMappedCount] ?? 0,
    ),
    multimodalOmittedCount: Number(
      meta[CDF_CANONICAL_CONTEXT_META.multimodalProviderOmittedCount] ?? 0,
    ),
    requirementCount: Array.isArray(request?.requirements)
      ? request!.requirements.length
      : 0,
    productionSpecPresent:
      meta[CDF_CANONICAL_CONTEXT_META.productionSpecPresent] === true ||
      Boolean(orch.ok && !orch.skipped && orch.contributors.productionSpec),
    outputContractPresent:
      meta[CDF_CANONICAL_CONTEXT_META.outputRequirementsPresent] === true ||
      Boolean(orch.ok && !orch.skipped && orch.contributors.outputContract),
    providerId: input.providerId,
    modelId: input.modelId,
    representationStrategy: input.representationStrategy,
    contributors:
      orch.ok && !orch.skipped
        ? (orch.contributors as unknown as Record<string, boolean>)
        : undefined,
    sensitiveBodiesOmitted: true,
  };
}

/**
 * Assert inspection payload never contains sensitive body keys.
 * Used by controlled tests.
 */
export function assertInspectionOmitsSensitiveBodies(
  inspection: ConversationalContextInspection,
): void {
  const serialized = JSON.stringify(inspection);
  const forbidden = [
    "CURRENT USER INSTRUCTION:",
    "data:image",
    "s3://",
    "https://",
    "extractedText",
    "attachmentUrl",
    "signedUrl",
  ];
  for (const f of forbidden) {
    if (serialized.includes(f)) {
      throw new Error(`Inspection leaked sensitive marker: ${f}`);
    }
  }
  if (inspection.sensitiveBodiesOmitted !== true) {
    throw new Error("sensitiveBodiesOmitted must be true");
  }
}
