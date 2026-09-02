/**
 * P4.9 — Resolve canonical artifact identity → provider input reference.
 */

import type { ExecutionArtifactRef } from "../../api/contracts";
import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import type { InputAssetReference } from "../../providers/common/input-asset-validator";
import { hydrateArtifacts } from "../../os/evaluation/artifact-evaluation/artifact-hydrator";

export type ResolvedArtifactReference = Readonly<{
  readonly artifactId: string;
  readonly executionId?: string;
  readonly organizationId: string;
  readonly mimeType: string;
  readonly providerInput: InputAssetReference;
  readonly source: "artifact_store" | "inline_fixture";
}>;

function bytesToDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

/**
 * Resolve artifact bytes from durable artifact repository + blob storage.
 */
export async function resolveArtifactReferenceForProvider(input: {
  readonly artifactsRepo: IArtifactRepository;
  readonly blobStorage: IBlobStorage;
  readonly organizationId: string;
  readonly artifactId: string;
}): Promise<ResolvedArtifactReference | undefined> {
  const hydrated = await hydrateArtifacts({
    artifactsRepo: input.artifactsRepo,
    blobStorage: input.blobStorage,
    organizationId: input.organizationId,
    artifactIds: [input.artifactId],
  });
  const first = hydrated[0];
  if (!first) return undefined;

  const rec = await input.artifactsRepo.get(input.artifactId);
  const storageRef = rec?.artifact.label?.startsWith("blob:")
    ? rec.artifact.label
    : undefined;

  return Object.freeze({
    artifactId: first.artifactId,
    organizationId: input.organizationId,
    mimeType: first.mimeType,
    source: "artifact_store",
    executionId: rec?.executionId,
    providerInput: Object.freeze({
      url: bytesToDataUrl(first.bytes, first.mimeType),
      mimeType: first.mimeType,
      organizationId: input.organizationId,
      ...(storageRef ? { storageRef } : {}),
    }),
  });
}
export function resolveArtifactReferenceFromInlineRef(input: {
  readonly artifact: ExecutionArtifactRef;
  readonly organizationId: string;
  readonly executionId?: string;
}): ResolvedArtifactReference | undefined {
  const label = input.artifact.label?.trim() ?? "";
  if (!label.startsWith("data:") && !label.startsWith("blob:")) {
    return undefined;
  }
  if (label.startsWith("data:")) {
    const mimeType =
      input.artifact.mimeType ??
      label.match(/^data:([^;]+);/)?.[1] ??
      "image/png";
    return Object.freeze({
      artifactId: input.artifact.artifactId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      mimeType,
      source: "inline_fixture",
      providerInput: Object.freeze({
        url: label,
        mimeType,
        organizationId: input.organizationId,
      }),
    });
  }

  return undefined;
}

export async function resolveArtifactReferenceFromStore(input: {
  readonly artifactsRepo?: IArtifactRepository;
  readonly blobStorage?: IBlobStorage;
  readonly organizationId: string;
  readonly artifactId: string;
  readonly inlineArtifact?: ExecutionArtifactRef;
  readonly executionId?: string;
}): Promise<ResolvedArtifactReference | undefined> {
  if (input.inlineArtifact) {
    const inline = resolveArtifactReferenceFromInlineRef({
      artifact: input.inlineArtifact,
      organizationId: input.organizationId,
      executionId: input.executionId,
    });
    if (inline) return inline;
  }

  if (input.artifactsRepo && input.blobStorage) {
    return resolveArtifactReferenceForProvider({
      artifactsRepo: input.artifactsRepo,
      blobStorage: input.blobStorage,
      organizationId: input.organizationId,
      artifactId: input.artifactId,
    });
  }

  return undefined;
}

export function attachReferenceToExecutionMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly resolved: ResolvedArtifactReference;
  readonly referenceKind?: "artifact" | "brand_vault_asset";
}): Record<string, unknown> {
  const existingAssets = Array.isArray(input.metadata.assets)
    ? [...input.metadata.assets]
    : [];
  const meta: Record<string, unknown> = {
    ...input.metadata,
    referenceArtifactId: input.resolved.artifactId,
    referenceInputPresent: true,
    referenceInputType: input.referenceKind ?? "artifact",
    targetArtifactId: input.resolved.artifactId,
    ...(input.resolved.executionId
      ? { targetExecutionId: input.resolved.executionId }
      : {}),
    image: input.resolved.providerInput,
    assets: [...existingAssets, input.resolved.providerInput],
    outputKind: "edited_image",
    capabilityId: "image.edit",
    capabilityHint: "image.edit",
    visualOperationKind:
      typeof input.metadata.conversationalAction === "string" &&
      input.metadata.conversationalAction === "REGENERATE"
        ? "REGENERATE"
        : "MODIFY",
    preserveExistingVisual: true,
  };
  return meta;
}
