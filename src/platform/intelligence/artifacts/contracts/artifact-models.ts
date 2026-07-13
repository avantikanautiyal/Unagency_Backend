/**
 * Intelligence Artifact Platform — core immutable contracts.
 * Git Objects for Intelligence — not storage, not persistence.
 */

import type {
  CapabilityId,
  ExecutionId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type ArtifactType =
  | "context"
  | "knowledge"
  | "prompt"
  | "provider_request"
  | "provider_response"
  | "execution"
  | "evaluation"
  | "memory"
  | "learning"
  | "workflow"
  | "decision"
  | "human"
  | "brand"
  | "capability"
  | "policy";

export type ArtifactLifecycleState =
  | "created"
  | "validated"
  | "published"
  | "superseded"
  | "archived"
  | "deleted";

export type ArtifactVersionState = "draft" | "published" | "deprecated" | "archived";

export type ArtifactRelationshipKind =
  | "parent"
  | "child"
  | "derived_from"
  | "created_from"
  | "supersedes"
  | "references"
  | "depends_on";

export type ArtifactSignatureAlgorithm = "sha256" | "canonical_sha256" | "placeholder_hmac";

export interface ArtifactIdentity {
  readonly artifactId: string;
  readonly type: ArtifactType;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: UserId;
  readonly capabilityId?: CapabilityId;
  readonly executionId?: ExecutionId;
  readonly projectId?: string;
  readonly campaignId?: string;
  readonly taskId?: string;
  readonly conversationId?: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
}

export interface ArtifactVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly revision: number;
  readonly label: string;
  readonly state: ArtifactVersionState;
  readonly createdAt: string;
  readonly publishedAt?: string;
}

export interface ArtifactMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly sourceModule?: string;
  readonly contentType?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ArtifactReference {
  readonly artifactId: string;
  readonly type: ArtifactType;
  readonly versionLabel?: string;
  readonly relationship: ArtifactRelationshipKind;
}

export interface ArtifactRelationship {
  readonly id: string;
  readonly sourceArtifactId: string;
  readonly targetArtifactId: string;
  readonly kind: ArtifactRelationshipKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactLineage {
  readonly parents: readonly ArtifactReference[];
  readonly children: readonly ArtifactReference[];
  readonly createdFrom?: readonly ArtifactReference[];
  readonly derivedFrom?: readonly ArtifactReference[];
  readonly executionId?: ExecutionId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly campaignId?: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly conversationId?: string;
  readonly sessionId?: string;
}

export interface ArtifactProvenanceSource {
  readonly kind:
    | "context"
    | "knowledge"
    | "prompt"
    | "provider"
    | "model"
    | "evaluation"
    | "human"
    | "workflow"
    | "execution"
    | "capability"
    | "policy";
  readonly artifactId?: string;
  readonly versionLabel?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly timestamp: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactProvenance {
  readonly sources: readonly ArtifactProvenanceSource[];
  readonly createdByModule: string;
  readonly createdAt: string;
  readonly policyIds?: readonly string[];
  readonly capabilityId?: CapabilityId;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly versions?: Readonly<Record<string, string>>;
}

export interface ArtifactSignature {
  readonly algorithm: ArtifactSignatureAlgorithm;
  readonly checksum: string;
  readonly signature?: string;
  readonly signedAt: string;
  readonly tamperDetected?: boolean;
}

export interface ArtifactDescriptor {
  readonly type: ArtifactType;
  readonly schemaVersion: string;
  readonly displayName: string;
  readonly description?: string;
  readonly payloadKey: string;
  readonly supportsVersioning: boolean;
  readonly supportsLineage: boolean;
}

export interface ArtifactRegistryEntry {
  readonly descriptor: ArtifactDescriptor;
  readonly registeredAt: string;
  readonly isActive: boolean;
}

export interface ArtifactValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly severity: "error" | "warning";
}

export interface ArtifactValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ArtifactValidationIssue[];
  readonly validatedAt: string;
}

export interface ArtifactManifest {
  readonly manifestId: string;
  readonly artifactId: string;
  readonly type: ArtifactType;
  readonly version: ArtifactVersion;
  readonly identity: ArtifactIdentity;
  readonly checksum: string;
  readonly createdAt: string;
}

export interface Artifact<TPayload = Readonly<Record<string, unknown>>> {
  readonly identity: ArtifactIdentity;
  readonly type: ArtifactType;
  readonly version: ArtifactVersion;
  readonly metadata: ArtifactMetadata;
  readonly lineage: ArtifactLineage;
  readonly provenance: ArtifactProvenance;
  readonly lifecycle: ArtifactLifecycleState;
  readonly signature: ArtifactSignature;
  readonly relationships: readonly ArtifactRelationship[];
  readonly payload: TPayload;
}

export interface ArtifactSnapshot<TPayload = Readonly<Record<string, unknown>>> {
  readonly snapshotId: string;
  readonly artifact: Artifact<TPayload>;
  readonly manifest: ArtifactManifest;
  readonly capturedAt: string;
  readonly checksum: string;
}

export interface ArtifactCollection {
  readonly collectionId: string;
  readonly name: string;
  readonly artifacts: readonly ArtifactSnapshot[];
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactInput<TPayload = Readonly<Record<string, unknown>>> {
  readonly type: ArtifactType;
  readonly identity: Partial<ArtifactIdentity> & {
    readonly organizationId: OrganizationId;
    readonly workspaceId: WorkspaceId;
  };
  readonly payload: TPayload;
  readonly metadata?: Partial<ArtifactMetadata>;
  readonly lineage?: Partial<ArtifactLineage>;
  readonly provenance?: Partial<ArtifactProvenance>;
  readonly parents?: readonly ArtifactReference[];
  readonly derivedFrom?: readonly ArtifactReference[];
  readonly createdFrom?: readonly ArtifactReference[];
  readonly relationships?: readonly ArtifactRelationship[];
  readonly version?: Partial<ArtifactVersion>;
  readonly lifecycle?: ArtifactLifecycleState;
  readonly sourceModule: string;
}

export interface ArtifactResult<TPayload = Readonly<Record<string, unknown>>> {
  readonly artifact: Artifact<TPayload>;
  readonly snapshot: ArtifactSnapshot<TPayload>;
  readonly validation: ArtifactValidationResult;
}
