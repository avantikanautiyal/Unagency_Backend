/**
 * Memory Intelligence Engine ports.
 *
 * Purpose: Store, classify, retrieve, and snapshot intelligence artifacts.
 * Responsibilities: Experience layer — not conversation history, learning, or vectors.
 * Usage: Injected into MemoryIntelligenceEngine.
 * Future Extension: Mongo/Redis/vector/blob stores behind IMemoryStore.
 */

import type { Result } from "../../shared/result";
import type {
  MemoryArtifact,
  MemoryClassification,
  MemoryCompressionStrategyName,
  MemoryIngestInput,
  MemoryRecord,
  MemoryRequest,
  MemoryResult,
  MemoryRetentionPolicy,
  MemoryScope,
  MemorySnapshot,
  MemoryWriteInput,
} from "../contracts/memory-models";

export interface IMemoryStore {
  save(record: MemoryRecord): Promise<Result<MemoryRecord>>;
  get(id: string): Promise<Result<MemoryRecord>>;
  list(request?: MemoryRequest): Promise<Result<readonly MemoryRecord[]>>;
  delete(id: string): Promise<Result<void>>;
  clear(): Promise<void>;
}

export interface IMemoryScopeResolver {
  resolve(input: MemoryWriteInput | MemoryIngestInput | MemoryRequest): Result<MemoryScope>;
}

export interface IMemoryRetriever {
  retrieve(request: MemoryRequest): Promise<Result<readonly MemoryRecord[]>>;
}

export interface IMemoryRetentionEngine {
  apply(
    record: MemoryRecord,
    policy?: MemoryRetentionPolicy
  ): Result<MemoryRecord>;
  classifyRetention(
    classification: MemoryClassification
  ): MemoryRetentionPolicy;
}

export interface IMemoryCompressionStrategy {
  readonly name: MemoryCompressionStrategyName;
  compress(
    records: readonly MemoryRecord[]
  ): Promise<Result<readonly MemoryRecord[]>>;
}

export interface IMemoryIndex {
  readonly kind: "vector" | "keyword" | "metadata" | "temporal";
}

export interface IMemoryIntelligenceEngine {
  ingest(input: MemoryIngestInput): Promise<Result<MemoryResult>>;
  write(input: MemoryWriteInput): Promise<Result<MemoryRecord>>;
  query(request: MemoryRequest): Promise<Result<MemoryResult>>;
  snapshot(request: MemoryRequest): Promise<Result<MemorySnapshot>>;
}
