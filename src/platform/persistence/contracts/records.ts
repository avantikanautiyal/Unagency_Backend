/**
 * Core persistence record contracts — dialect-agnostic.
 */

import type { EntityCollection } from "./enums";

/** Optimistic concurrency envelope around any domain payload. */
export interface PersistedEntity<TPayload = Readonly<Record<string, unknown>>> {
  readonly id: string;
  readonly collection: EntityCollection;
  readonly payload: TPayload;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
  readonly organizationId?: string;
  /** Fields encrypted at rest (ciphertext in payload keys listed here). */
  readonly encryptedFields?: readonly string[];
}

export interface RepositoryQuery {
  readonly organizationId?: string;
  readonly ids?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
  readonly includeDeleted?: boolean;
}

export interface WriteOptions {
  /** Expected version for optimistic concurrency; omit for create. */
  readonly expectedVersion?: number;
  readonly encryptFields?: readonly string[];
}

export interface MigrationDefinition {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly environments: readonly import("./enums").MigrationEnvironment[];
  readonly up: () => Promise<void> | void;
  readonly down: () => Promise<void> | void;
}

export interface MigrationRecord {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly appliedAt: string;
  readonly environment: import("./enums").MigrationEnvironment;
  readonly checksum: string;
}

export interface DomainEventRecord {
  readonly eventId: string;
  readonly aggregateType: EntityCollection | string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly organizationId?: string;
}

export interface OutboxMessage {
  readonly outboxId: string;
  readonly event: DomainEventRecord;
  readonly status: import("./enums").OutboxStatus;
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly attempts: number;
}

export interface SnapshotRecord {
  readonly snapshotId: string;
  readonly kind: import("./enums").BackupKind;
  readonly createdAt: string;
  readonly collections: readonly EntityCollection[];
  readonly entityCount: number;
  readonly checksum: string;
}

export interface BackupArtifact {
  readonly backupId: string;
  readonly kind: import("./enums").BackupKind;
  readonly createdAt: string;
  readonly snapshotId: string;
  readonly baseBackupId?: string;
  readonly storageKey: string;
}

export interface RestorePoint {
  readonly restorePointId: string;
  readonly backupId: string;
  readonly createdAt: string;
  readonly label: string;
}

export interface SearchIndexDocument {
  readonly indexName: string;
  readonly documentId: string;
  readonly organizationId?: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly indexedAt: string;
}

export interface SeedDefinition {
  readonly seedId: string;
  readonly name: string;
  readonly collection: EntityCollection;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}
