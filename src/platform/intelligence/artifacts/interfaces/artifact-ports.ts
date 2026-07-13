/**
 * Intelligence Artifact Platform ports.
 *
 * Purpose: Canonical immutable intelligence objects for the platform.
 * Responsibilities: Identity, versioning, lineage, provenance, signatures.
 * Usage: Injected into ArtifactEngine.
 * Future Extension: Durable stores behind external persistence adapters.
 */

import type { Result } from "../../shared/result";
import type {
  Artifact,
  ArtifactCollection,
  ArtifactDescriptor,
  ArtifactIdentity,
  ArtifactInput,
  ArtifactLineage,
  ArtifactLifecycleState,
  ArtifactManifest,
  ArtifactMetadata,
  ArtifactProvenance,
  ArtifactRegistryEntry,
  ArtifactResult,
  ArtifactSignature,
  ArtifactSnapshot,
  ArtifactType,
  ArtifactValidationResult,
  ArtifactVersion,
} from "../contracts/artifact-models";

export interface ArtifactBuildContext {
  readonly input: ArtifactInput;
  readonly identity: ArtifactIdentity;
  readonly metadata: ArtifactMetadata;
  readonly version: ArtifactVersion;
  readonly lineage: ArtifactLineage;
  readonly provenance: ArtifactProvenance;
  readonly lifecycle: ArtifactLifecycleState;
}

export interface IArtifactIdentityBuilder {
  build(input: ArtifactInput): Result<ArtifactIdentity>;
}

export interface IArtifactMetadataBuilder {
  build(input: ArtifactInput, identity: ArtifactIdentity): Result<ArtifactMetadata>;
}

export interface IArtifactVersionEngine {
  resolve(input: ArtifactInput, identity: ArtifactIdentity): Result<ArtifactVersion>;
  bump(
    current: ArtifactVersion,
    part: "major" | "minor" | "patch" | "revision"
  ): ArtifactVersion;
  format(version: ArtifactVersion): string;
}

export interface IArtifactLineageEngine {
  build(input: ArtifactInput, identity: ArtifactIdentity): Result<ArtifactLineage>;
}

export interface IArtifactProvenanceEngine {
  build(
    input: ArtifactInput,
    identity: ArtifactIdentity,
    lineage: ArtifactLineage
  ): Result<ArtifactProvenance>;
}

export interface IArtifactSignatureEngine {
  sign(artifact: Omit<Artifact, "signature">): Result<ArtifactSignature>;
  verify(artifact: Artifact): Result<boolean>;
}

export interface IArtifactValidator {
  validate(artifact: Artifact): Result<ArtifactValidationResult>;
}

export interface IArtifactSnapshotBuilder {
  build(artifact: Artifact, manifest: ArtifactManifest): ArtifactSnapshot;
}

export interface IArtifactManifestBuilder {
  build(artifact: Artifact): ArtifactManifest;
}

export interface IArtifactSerializer {
  readonly format: "json" | "canonical_json";
  serialize(artifact: Artifact): Result<string>;
  deserialize<TPayload = Readonly<Record<string, unknown>>>(
    payload: string
  ): Result<Artifact<TPayload>>;
}

export interface IArtifactLifecycleManager {
  canTransition(from: ArtifactLifecycleState, to: ArtifactLifecycleState): boolean;
  transition(
    artifact: Artifact,
    to: ArtifactLifecycleState
  ): Result<Artifact>;
}

export interface IArtifactRegistry {
  register(descriptor: ArtifactDescriptor): Result<ArtifactRegistryEntry>;
  resolve(type: ArtifactType): Result<ArtifactDescriptor>;
  list(): readonly ArtifactRegistryEntry[];
}

export interface IArtifactCollectionStore {
  create(name: string): ArtifactCollection;
  add(collectionId: string, snapshot: ArtifactSnapshot): Result<ArtifactCollection>;
  search(
    collectionId: string,
    query: ArtifactCollectionQuery
  ): Result<readonly ArtifactSnapshot[]>;
  filter(
    collectionId: string,
    predicate: ArtifactCollectionPredicate
  ): Result<readonly ArtifactSnapshot[]>;
  groupBy(
    collectionId: string,
    key: ArtifactCollectionGroupKey
  ): Result<Readonly<Record<string, readonly ArtifactSnapshot[]>>>;
  iterate(collectionId: string): Result<readonly ArtifactSnapshot[]>;
}

export type ArtifactCollectionGroupKey =
  | "type"
  | "lifecycle"
  | "organizationId"
  | "workspaceId"
  | "sourceModule";

export interface ArtifactCollectionQuery {
  readonly type?: ArtifactType;
  readonly lifecycle?: ArtifactLifecycleState;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly sourceModule?: string;
  readonly tag?: string;
}

export type ArtifactCollectionPredicate = (
  snapshot: ArtifactSnapshot
) => boolean;

export interface IArtifactIndex {
  readonly kind: "metadata" | "relationship" | "lineage" | "temporal" | "semantic";
  readonly supported: boolean;
}

export interface IArtifactEngine {
  create<TPayload = Readonly<Record<string, unknown>>>(
    input: ArtifactInput<TPayload>
  ): Promise<Result<ArtifactResult<TPayload>>>;
  snapshot(artifact: Artifact): Result<ArtifactSnapshot>;
  serialize(artifact: Artifact, format?: "json" | "canonical_json"): Result<string>;
}
