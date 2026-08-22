/**
 * Factory for MemoryIntelligenceEngine with in-memory store.
 */

import { resolveCompressionStrategy } from "../compression/compression-strategies";
import { MemoryIntelligenceEngine } from "../engine/memory-intelligence-engine";
import type { IMemoryIntelligenceEngine } from "../interfaces/memory-ports";
import { MemoryRetentionEngine } from "../retention/retention-engine";
import { MemoryRetriever } from "../retrieval/memory-retriever";
import { MemoryScopeResolver } from "../scopes/scope-resolver";
import type { IMemoryStore } from "../interfaces/memory-ports";
import { InMemoryMemoryStore } from "../stores/in-memory-memory-store";

export interface CreateMemoryEngineOptions {
  readonly compressionStrategy?:
    | "merge"
    | "deduplicate"
    | "summarize"
    | "importance_ranking";
  readonly store?: IMemoryStore;
}

export function createMemoryIntelligenceEngine(
  options: CreateMemoryEngineOptions = {}
): IMemoryIntelligenceEngine {
  const store = options.store ?? new InMemoryMemoryStore();
  return new MemoryIntelligenceEngine({
    store,
    scopeResolver: new MemoryScopeResolver(),
    retentionEngine: new MemoryRetentionEngine(),
    retriever: new MemoryRetriever(store),
    compressionStrategy: resolveCompressionStrategy(
      options.compressionStrategy ?? "deduplicate"
    ),
  });
}
