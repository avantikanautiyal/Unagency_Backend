/**
 * Model Registry branded identifiers.
 */

export type CanonicalModelId = string & { readonly __brand: "CanonicalModelId" };
export type ModelManifestId = string & { readonly __brand: "ModelManifestId" };
export type ProviderManifestId = string & { readonly __brand: "ProviderManifestId" };
export type ModelSnapshotId = string & { readonly __brand: "ModelSnapshotId" };

export function asCanonicalModelId(value: string): CanonicalModelId {
  if (!value.trim()) throw new Error("CanonicalModelId cannot be empty");
  return value as CanonicalModelId;
}

export function asModelManifestId(value: string): ModelManifestId {
  if (!value.trim()) throw new Error("ModelManifestId cannot be empty");
  return value as ModelManifestId;
}

export function asProviderManifestId(value: string): ProviderManifestId {
  if (!value.trim()) throw new Error("ProviderManifestId cannot be empty");
  return value as ProviderManifestId;
}

export function asModelSnapshotId(value: string): ModelSnapshotId {
  if (!value.trim()) throw new Error("ModelSnapshotId cannot be empty");
  return value as ModelSnapshotId;
}
