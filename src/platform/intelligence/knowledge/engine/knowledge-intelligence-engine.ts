/**
 * Knowledge Intelligence Engine.
 *
 * Purpose: Discover, retrieve, rank, filter, and package knowledge snapshots.
 * Responsibilities: Full knowledge pipeline without providers, vectors, or prompts.
 * Usage: Consumes KnowledgeRequest (optionally from IntelligenceContext).
 * Future Extension: Real source adapters behind IKnowledgeSource.
 */

import { createHash } from "crypto";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import { KnowledgeSnapshotBuilder } from "../builders/knowledge-builders";
import type {
  KnowledgeRequest,
  KnowledgeResult,
  KnowledgeSnapshot,
} from "../contracts/knowledge-models";
import { KnowledgeError } from "../errors";
import type {
  IKnowledgeCache,
  IKnowledgeFilterEngine,
  IKnowledgeIntelligenceEngine,
  IKnowledgePermissionEngine,
  IKnowledgeRankingStrategy,
  IKnowledgeRetriever,
  IKnowledgeSourceResolver,
} from "../interfaces/knowledge-ports";
import { resolveRankingStrategy } from "../ranking/ranking-strategies";

export interface KnowledgeIntelligenceEngineDependencies {
  readonly sourceResolver: IKnowledgeSourceResolver;
  readonly permissionEngine: IKnowledgePermissionEngine;
  readonly retriever: IKnowledgeRetriever;
  readonly filterEngine: IKnowledgeFilterEngine;
  readonly rankingStrategy?: IKnowledgeRankingStrategy;
  readonly cache?: IKnowledgeCache;
  readonly nowIso?: () => string;
  readonly cacheTtlSeconds?: number;
}

export class KnowledgeIntelligenceEngine implements IKnowledgeIntelligenceEngine {
  private readonly nowIso: () => string;

  constructor(private readonly deps: KnowledgeIntelligenceEngineDependencies) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  async query(request: KnowledgeRequest): Promise<Result<KnowledgeResult>> {
    const snapshot = await this.snapshot(request);
    if (!snapshot.ok) {
      return snapshot;
    }

    return success({
      snapshot: snapshot.value,
      candidateCount: snapshot.value.metadata?.attributes?.candidateCount as
        | number
        | undefined ?? snapshot.value.documents.length,
      filteredCount: snapshot.value.documents.length,
      sourceCount: snapshot.value.sources.length,
    });
  }

  async snapshot(
    request: KnowledgeRequest
  ): Promise<Result<KnowledgeSnapshot>> {
    const cacheKey = this.cacheKey(request);
    if (this.deps.cache) {
      const cached = await this.deps.cache.get(cacheKey);
      if (cached) {
        return success(cached);
      }
    }

    const authorized = await this.deps.permissionEngine.authorize(request);
    if (!authorized.ok) {
      return authorized;
    }

    const sources = await this.deps.sourceResolver.resolve(request);
    if (!sources.ok) {
      return sources;
    }

    const retrieved = await this.deps.retriever.retrieve(
      request,
      sources.value
    );
    if (!retrieved.ok) {
      return retrieved;
    }

    const candidateCount = retrieved.value.length;

    const permissionFiltered =
      await this.deps.permissionEngine.filterAuthorized(
        request,
        retrieved.value
      );
    if (!permissionFiltered.ok) {
      return permissionFiltered;
    }

    const ranking =
      this.deps.rankingStrategy ??
      resolveRankingStrategy(request.ranking?.strategy ?? "hybrid");

    const ranked = await ranking.rank(
      permissionFiltered.value,
      request.ranking
    );
    if (!ranked.ok) {
      return ranked;
    }

    const filtered = await this.deps.filterEngine.filter(
      ranked.value,
      request.filter,
      this.nowIso()
    );
    if (!filtered.ok) {
      return filtered;
    }

    const snapshot = KnowledgeSnapshotBuilder.create()
      .withIdentity(request.identity)
      .withDocuments(filtered.value)
      .withSources(sources.value)
      .build(this.nowIso);

    const withMeta: KnowledgeSnapshot = {
      ...snapshot,
      metadata: {
        ...snapshot.metadata,
        attributes: {
          candidateCount,
          rankingStrategy: ranking.name,
        },
      },
    };

    if (this.deps.cache) {
      await this.deps.cache.set(
        cacheKey,
        withMeta,
        this.deps.cacheTtlSeconds ?? 60
      );
    }

    return success(withMeta);
  }

  private cacheKey(request: KnowledgeRequest): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          org: request.identity.organizationId,
          ws: request.identity.workspaceId,
          cap: request.identity.capabilityId,
          query: request.query,
          filter: request.filter,
          ranking: request.ranking,
        })
      )
      .digest("hex");
  }
}

export function assertKnowledgeResult(
  result: Result<KnowledgeResult>
): asserts result is { ok: true; value: KnowledgeResult } {
  if (!result.ok) {
    throw result.error instanceof KnowledgeError
      ? result.error
      : new KnowledgeError("Knowledge query failed", { cause: result.error });
  }
}
