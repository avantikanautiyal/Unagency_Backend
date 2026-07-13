/**
 * Memory Intelligence Engine immutable contracts.
 * Experience layer — not conversation history, learning, or vector storage.
 */

import type {
  CapabilityId,
  ExecutionId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type MemoryScopeKind =
  | "platform"
  | "organization"
  | "workspace"
  | "project"
  | "campaign"
  | "task"
  | "conversation"
  | "session";

export type MemoryClassification =
  | "prompt"
  | "knowledge"
  | "execution"
  | "response"
  | "evaluation"
  | "human_feedback"
  | "brand_asset"
  | "decision"
  | "learning_reference"
  | "conversation";

export type MemoryLifecycleState =
  | "draft"
  | "active"
  | "compressed"
  | "archived"
  | "deleted";

export type MemoryRetentionClass =
  | "temporary"
  | "short_term"
  | "working"
  | "long_term"
  | "archived"
  | "deleted";

export type MemoryCompressionStrategyName =
  | "merge"
  | "deduplicate"
  | "summarize"
  | "importance_ranking";

export interface MemoryIdentity {
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

export interface MemoryScope {
  readonly kind: MemoryScopeKind;
  readonly scopeId: string;
  readonly parentScopeId?: string;
}

export interface MemoryMetadata {
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly sourceModule?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface MemoryRetentionPolicy {
  readonly retentionClass: MemoryRetentionClass;
  readonly retainUntil?: string;
  readonly maxRecords?: number;
}

export interface MemoryRecord {
  readonly id: string;
  readonly identity: MemoryIdentity;
  readonly scope: MemoryScope;
  readonly classification: MemoryClassification;
  readonly lifecycleState: MemoryLifecycleState;
  readonly retention: MemoryRetentionPolicy;
  readonly content: Readonly<Record<string, unknown>>;
  readonly metadata: MemoryMetadata;
  readonly importance?: number;
}

export interface MemoryCollection {
  readonly id: string;
  readonly records: readonly MemoryRecord[];
  readonly scopes: readonly MemoryScope[];
}

export interface MemoryIndex {
  readonly kind: "vector" | "keyword" | "metadata" | "temporal";
}

export interface MemoryRequest {
  readonly identity: MemoryIdentity;
  readonly scope?: MemoryScope;
  readonly classifications?: readonly MemoryClassification[];
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly includeDeleted?: boolean;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface MemorySnapshot {
  readonly snapshotId: string;
  readonly identity: MemoryIdentity;
  readonly records: readonly MemoryRecord[];
  readonly scopes: readonly MemoryScope[];
  readonly capturedAt: string;
  readonly checksum?: string;
  readonly metadata?: MemoryMetadata;
}

export interface MemoryResult {
  readonly snapshot: MemorySnapshot;
  readonly storedCount: number;
  readonly retrievedCount: number;
}

export interface MemoryWriteInput {
  readonly identity: MemoryIdentity;
  readonly scope: MemoryScope;
  readonly classification: MemoryClassification;
  readonly content: Readonly<Record<string, unknown>>;
  readonly retention?: MemoryRetentionPolicy;
  readonly metadata?: Partial<MemoryMetadata>;
  readonly importance?: number;
}

export interface MemoryIngestInput {
  readonly identity: MemoryIdentity;
  readonly scope: MemoryScope;
  readonly artifacts: readonly MemoryArtifact[];
  readonly retention?: MemoryRetentionPolicy;
}

/**
 * Execution artifacts accepted for memory ingestion (provider-independent).
 */
export interface MemoryArtifact {
  readonly classification: MemoryClassification;
  readonly content: Readonly<Record<string, unknown>>;
  readonly importance?: number;
  readonly tags?: readonly string[];
  readonly sourceModule?: string;
}
