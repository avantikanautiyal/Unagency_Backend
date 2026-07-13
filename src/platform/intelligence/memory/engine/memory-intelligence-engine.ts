/**
 * Memory Intelligence Engine.
 *
 * Purpose: Store, classify, retrieve, and snapshot intelligence artifacts.
 * Responsibilities: Experience layer pipeline — not conversation, learning, or vectors.
 * Usage: ingest(artifacts) / query(request) / snapshot(request)
 * Future Extension: Durable stores behind IMemoryStore.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import {
  MemoryRecordBuilder,
  MemorySnapshotBuilder,
} from "../builders/memory-builders";
import type {
  MemoryIngestInput,
  MemoryRecord,
  MemoryRequest,
  MemoryResult,
  MemorySnapshot,
  MemoryWriteInput,
} from "../contracts/memory-models";
import { MemoryError, MemoryValidationError } from "../errors";
import type {
  IMemoryCompressionStrategy,
  IMemoryIntelligenceEngine,
  IMemoryRetentionEngine,
  IMemoryRetriever,
  IMemoryScopeResolver,
  IMemoryStore,
} from "../interfaces/memory-ports";

export interface MemoryIntelligenceEngineDependencies {
  readonly store: IMemoryStore;
  readonly scopeResolver: IMemoryScopeResolver;
  readonly retentionEngine: IMemoryRetentionEngine;
  readonly retriever: IMemoryRetriever;
  readonly compressionStrategy?: IMemoryCompressionStrategy;
  readonly nowIso?: () => string;
}

export class MemoryIntelligenceEngine implements IMemoryIntelligenceEngine {
  private readonly nowIso: () => string;

  constructor(private readonly deps: MemoryIntelligenceEngineDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  async write(input: MemoryWriteInput): Promise<Result<MemoryRecord>> {
    if (!input.identity.organizationId || !input.identity.workspaceId) {
      return failure(
        new MemoryValidationError("organizationId and workspaceId are required")
      );
    }

    const scope = this.deps.scopeResolver.resolve(input);
    if (!scope.ok) {
      return scope;
    }

    let record = MemoryRecordBuilder.create()
      .withIdentity(input.identity)
      .withScope(scope.value)
      .withClassification(input.classification)
      .withContent(input.content)
      .withRetention(input.retention)
      .withImportance(input.importance)
      .withMetadata({
        title: input.metadata?.title,
        tags: input.metadata?.tags,
        sourceModule: input.metadata?.sourceModule,
      })
      .build(this.nowIso);

    const retained = this.deps.retentionEngine.apply(record, input.retention);
    if (!retained.ok) {
      return retained;
    }
    record = retained.value;

    return this.deps.store.save(record);
  }

  async ingest(input: MemoryIngestInput): Promise<Result<MemoryResult>> {
    if (!input.artifacts.length) {
      return failure(new MemoryValidationError("artifacts are required"));
    }

    const stored: MemoryRecord[] = [];
    for (const artifact of input.artifacts) {
      const written = await this.write({
        identity: input.identity,
        scope: input.scope,
        classification: artifact.classification,
        content: artifact.content,
        retention: input.retention,
        importance: artifact.importance,
        metadata: {
          tags: artifact.tags,
          sourceModule: artifact.sourceModule,
        },
      });
      if (!written.ok) {
        return written;
      }
      stored.push(written.value);
    }

    let records: readonly MemoryRecord[] = stored;
    if (this.deps.compressionStrategy) {
      const compressed = await this.deps.compressionStrategy.compress(stored);
      if (!compressed.ok) {
        return compressed;
      }
      records = compressed.value;
    }

    const snapshot = MemorySnapshotBuilder.create()
      .withIdentity(input.identity)
      .withRecords(records)
      .build(this.nowIso);

    return success({
      snapshot,
      storedCount: stored.length,
      retrievedCount: records.length,
    });
  }

  async query(request: MemoryRequest): Promise<Result<MemoryResult>> {
    const snapshot = await this.snapshot(request);
    if (!snapshot.ok) {
      return snapshot;
    }
    return success({
      snapshot: snapshot.value,
      storedCount: snapshot.value.records.length,
      retrievedCount: snapshot.value.records.length,
    });
  }

  async snapshot(request: MemoryRequest): Promise<Result<MemorySnapshot>> {
    const retrieved = await this.deps.retriever.retrieve(request);
    if (!retrieved.ok) {
      return retrieved;
    }

    let records = retrieved.value;
    if (this.deps.compressionStrategy) {
      const compressed = await this.deps.compressionStrategy.compress(records);
      if (!compressed.ok) {
        return compressed;
      }
      records = compressed.value;
    }

    const snapshot = MemorySnapshotBuilder.create()
      .withIdentity(request.identity)
      .withRecords(records)
      .build(this.nowIso);

    return success(snapshot);
  }
}

export function assertMemoryResult(
  result: Result<MemoryResult>
): asserts result is { ok: true; value: MemoryResult } {
  if (!result.ok) {
    throw result.error instanceof MemoryError
      ? result.error
      : new MemoryError("Memory operation failed", { cause: result.error });
  }
}
