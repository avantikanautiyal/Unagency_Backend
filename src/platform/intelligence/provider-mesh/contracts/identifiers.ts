/** Branded mesh identifiers. */

export type ProviderMeshSnapshotId = string & { readonly __brand: "ProviderMeshSnapshotId" };
export type MeshResultId = string & { readonly __brand: "MeshResultId" };

export function asProviderMeshSnapshotId(id: string): ProviderMeshSnapshotId {
  return id as ProviderMeshSnapshotId;
}

export function asMeshResultId(id: string): MeshResultId {
  return id as MeshResultId;
}
