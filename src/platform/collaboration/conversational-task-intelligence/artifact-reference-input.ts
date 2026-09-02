/**
 * P4.9 — Canonical artifact-grounded visual operation (provider-independent).
 */

export type VisualOperationKind = "CREATE" | "MODIFY" | "REGENERATE";

export type ReferenceInputKind = "artifact" | "brand_vault_asset";

export type CanonicalReferenceInput = Readonly<{
  readonly kind: ReferenceInputKind;
  readonly artifactId?: string;
  readonly artifactVersionId?: string;
  readonly assetId?: string;
}>;

export type VisualOperationSpec = Readonly<{
  readonly operationKind: VisualOperationKind;
  readonly targetArtifactId?: string;
  readonly targetArtifactVersionId?: string;
  readonly referenceInput?: CanonicalReferenceInput;
  readonly preserveExisting: boolean;
  readonly requestedChange?: string;
}>;

export function isArtifactGroundedOperation(
  operation?: VisualOperationSpec,
): boolean {
  if (!operation) return false;
  return (
    (operation.operationKind === "MODIFY" || operation.operationKind === "REGENERATE") &&
    Boolean(operation.targetArtifactId ?? operation.referenceInput?.artifactId)
  );
}

export function referenceArtifactIdFromOperation(
  operation?: VisualOperationSpec,
): string | undefined {
  if (!operation) return undefined;
  return (
    operation.referenceInput?.artifactId ??
    operation.targetArtifactId
  );
}
