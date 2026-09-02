/**
 * P4.9 — Artifact-grounded visual modification planning (no new router).
 */

import type { ConversationalAction } from "./conversational-task-contract";
import type {
  CanonicalReferenceInput,
  VisualOperationKind,
  VisualOperationSpec,
} from "./artifact-reference-input";
import {
  defaultReferenceCapableImageProviderId,
  providerSupportsReferenceImageEdit,
} from "../../providers/image/configs/image-provider-capabilities";

export type VisualModificationPlan = Readonly<{
  readonly operationKind: VisualOperationKind;
  readonly targetArtifactId: string;
  readonly referenceInput: CanonicalReferenceInput;
  readonly preserveExisting: boolean;
  readonly requiresReferenceImage: true;
  readonly preferredReferenceCapableProviderId?: string;
}>;

export type VisualModificationUnsupported = Readonly<{
  readonly reason: "UNSUPPORTED_OPERATION";
  readonly message: string;
  readonly targetArtifactId: string;
  readonly attemptedProviderId?: string;
  readonly referenceCapableProviders: readonly string[];
}>;

const GROUNDED_ACTIONS = new Set<ConversationalAction>(["MODIFY", "REGENERATE"]);

export function isGroundedVisualAction(action?: string): boolean {
  return Boolean(action && GROUNDED_ACTIONS.has(action as ConversationalAction));
}

export function buildVisualOperationSpec(input: {
  readonly action: ConversationalAction;
  readonly message: string;
  readonly referencedArtifactId?: string;
  readonly referencedAssetId?: string;
  readonly preserveExisting?: boolean;
}): VisualOperationSpec | undefined {
  if (!isGroundedVisualAction(input.action)) return undefined;

  const targetArtifactId = input.referencedArtifactId?.trim();
  if (!targetArtifactId && !input.referencedAssetId?.trim()) return undefined;

  const referenceInput: CanonicalReferenceInput = targetArtifactId
    ? Object.freeze({
        kind: "artifact",
        artifactId: targetArtifactId,
      })
    : Object.freeze({
        kind: "brand_vault_asset",
        assetId: input.referencedAssetId!.trim(),
      });

  return Object.freeze({
    operationKind: input.action === "REGENERATE" ? "REGENERATE" : "MODIFY",
    targetArtifactId: targetArtifactId ?? undefined,
    referenceInput,
    preserveExisting: input.preserveExisting ?? true,
    requestedChange: input.message.trim() || undefined,
  });
}

export function planArtifactGroundedModification(input: {
  readonly action?: string;
  readonly referencedArtifactId?: string;
  readonly referencedAssetId?: string;
  readonly message?: string;
}): VisualModificationPlan | undefined {
  if (!isGroundedVisualAction(input.action)) return undefined;
  const artifactId = input.referencedArtifactId?.trim();
  if (!artifactId) return undefined;

  const operationKind: VisualOperationKind =
    input.action === "REGENERATE" ? "REGENERATE" : "MODIFY";

  return Object.freeze({
    operationKind,
    targetArtifactId: artifactId,
    referenceInput: Object.freeze({
      kind: "artifact",
      artifactId,
    }),
    preserveExisting: true,
    requiresReferenceImage: true,
    preferredReferenceCapableProviderId: defaultReferenceCapableImageProviderId(),
  });
}

export function assertReferenceCapableProviderOrUnsupported(input: {
  readonly providerId: string;
  readonly targetArtifactId: string;
  readonly hasReferenceInput: boolean;
  readonly operationKind?: string;
}): VisualModificationUnsupported | undefined {
  if (!input.hasReferenceInput) return undefined;
  if (!isGroundedVisualAction(input.operationKind)) return undefined;
  if (providerSupportsReferenceImageEdit(input.providerId)) return undefined;

  const capable = [
    defaultReferenceCapableImageProviderId(),
  ].filter((id): id is string => Boolean(id));

  return Object.freeze({
    reason: "UNSUPPORTED_OPERATION",
    message:
      `Selected image provider '${input.providerId}' does not support reference-image modification. ` +
      `Artifact '${input.targetArtifactId}' requires a reference-capable provider.`,
    targetArtifactId: input.targetArtifactId,
    attemptedProviderId: input.providerId,
    referenceCapableProviders: Object.freeze(capable),
  });
}

export function reorderImageCandidatesForReferenceEdit<T extends { providerId: string }>(
  candidates: readonly T[],
): readonly T[] {
  const capable = candidates.filter((c) => providerSupportsReferenceImageEdit(c.providerId));
  const incapable = candidates.filter((c) => !providerSupportsReferenceImageEdit(c.providerId));
  return Object.freeze([...capable, ...incapable]);
}

export function pickReferenceCapableCandidate<T extends { providerId: string }>(
  candidates: readonly T[],
): T | undefined {
  return candidates.find((c) => providerSupportsReferenceImageEdit(c.providerId));
}
