/**
 * Mongo-backed execution persistence.
 */

import type { ExecutionResource } from "../../../api/contracts";
import type {
  ExecutionArtifactRef,
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionTraceSummary,
} from "../../../api/contracts";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  ExecutionHistoryPage,
  ExecutionHistoryQuery,
} from "../interfaces/execution-store-ports";
import {
  mongoHistoryFilter,
  normalizeExecutionHistoryQuery,
} from "./execution-history-list";
import { EnterpriseArtifact } from "../mongo/models/enterprise-artifact.model";
import { EnterpriseExecution } from "../mongo/models/enterprise-execution.model";
import { EnterpriseExecutionExtras } from "../mongo/models/enterprise-execution-extras.model";

/**
 * Finished executions can be several MB (a built website is ~10 MB) and are
 * requested repeatedly by status polls and chat revisits. Reading the whole
 * row every time saturated the connection pool, so:
 *  - concurrent reads of one execution share a single database read;
 *  - a finished execution is kept in memory and re-validated with a tiny
 *    (status + updatedAt) read instead of being downloaded again;
 *  - a failed read is not retried for a few seconds.
 * Process-wide, so every repository instance sees the same state.
 */
const FINISHED_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const READ_FAILURE_BACKOFF_MS = 5_000;
const finishedCache = new Map<string, { doc: ExecutionResource; bytes: number }>();
let finishedCacheBytes = 0;
const inFlightReads = new Map<string, Promise<ExecutionResource | undefined>>();
const recentReadFailures = new Map<string, { untilMs: number; error: unknown }>();

function isFinished(status: unknown): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function dropFinished(executionId: string): void {
  const hit = finishedCache.get(executionId);
  if (!hit) return;
  finishedCacheBytes -= hit.bytes;
  finishedCache.delete(executionId);
}

function rememberFinished(doc: ExecutionResource): void {
  dropFinished(doc.executionId);
  if (!isFinished(doc.status)) return;
  let bytes = 0;
  try {
    bytes = JSON.stringify(doc).length;
  } catch {
    return;
  }
  if (bytes > FINISHED_CACHE_MAX_BYTES / 2) return;
  finishedCache.set(doc.executionId, { doc, bytes });
  finishedCacheBytes += bytes;
  // Evict oldest entries first (Map keeps insertion order).
  for (const key of finishedCache.keys()) {
    if (finishedCacheBytes <= FINISHED_CACHE_MAX_BYTES) break;
    if (key !== doc.executionId) dropFinished(key);
  }
}

/** Test hook — the cache is process-wide. */
export function resetExecutionReadCacheForTests(): void {
  finishedCache.clear();
  finishedCacheBytes = 0;
  inFlightReads.clear();
  recentReadFailures.clear();
}

export class MongoExecutionRepository implements IExecutionRepository {
  async save(execution: ExecutionResource): Promise<void> {
    const previous = await EnterpriseExecution.findOneAndUpdate(
      { executionId: execution.executionId },
      { $set: execution },
      {
        upsert: true,
        new: false,
        projection: {
          status: 1,
          userId: 1,
          productAction: 1,
          parentExecutionId: 1,
          conversationId: 1,
        },
      }
    ).lean();
    // Keep the in-memory copy identical to what was just written.
    rememberFinished(execution);
    if (execution.status === "succeeded" && previous?.status !== "succeeded") {
      void import("../../../../notifications/client-execution-notifications")
        .then((m) =>
          m.notifyClientExecutionSucceeded(
            (previous ?? null) as Partial<ExecutionResource> | null,
            execution
          )
        )
        .catch(() => undefined);
    }
  }

  async get(executionId: string): Promise<ExecutionResource | undefined> {
    const cached = finishedCache.get(executionId);
    if (cached) {
      // Tiny freshness check — never serve a copy another writer has changed.
      try {
        const head = (await EnterpriseExecution.findOne(
          { executionId },
          { status: 1, updatedAt: 1, _id: 0 },
        )
          .maxTimeMS(10_000)
          .lean()) as { status?: unknown; updatedAt?: unknown } | null;
        if (!head) {
          dropFinished(executionId);
          return undefined;
        }
        if (
          head.status === cached.doc.status &&
          String(head.updatedAt ?? "") === String(cached.doc.updatedAt ?? "")
        ) {
          return { ...cached.doc };
        }
        dropFinished(executionId);
      } catch {
        // Database unreachable: a finished execution does not change on its own.
        return { ...cached.doc };
      }
    }

    const failed = recentReadFailures.get(executionId);
    if (failed) {
      if (Date.now() < failed.untilMs) throw failed.error;
      recentReadFailures.delete(executionId);
    }

    const pending = inFlightReads.get(executionId);
    if (pending) return pending;
    const read = (async () => {
      try {
        const doc = (await EnterpriseExecution.findOne({ executionId }).lean()) as
          | ExecutionResource
          | null;
        if (!doc) return undefined;
        rememberFinished(doc);
        return doc;
      } catch (err) {
        recentReadFailures.set(executionId, {
          untilMs: Date.now() + READ_FAILURE_BACKOFF_MS,
          error: err,
        });
        console.warn(
          JSON.stringify({
            scope: "execution.persistence",
            event: "execution_read_failed",
            executionId,
            retryAfterMs: READ_FAILURE_BACKOFF_MS,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        throw err;
      } finally {
        inFlightReads.delete(executionId);
      }
    })();
    inFlightReads.set(executionId, read);
    return read;
  }

  async listByTenant(
    organizationId: string,
    queryOrLimit?: ExecutionHistoryQuery | number
  ): Promise<ExecutionHistoryPage> {
    const query = normalizeExecutionHistoryQuery(queryOrLimit);
    const filter = mongoHistoryFilter(organizationId, queryOrLimit);
    const sort =
      query.sort === "oldest" ? { createdAt: 1 as const } : { createdAt: -1 as const };
    const total = await EnterpriseExecution.countDocuments(filter);
    const docs = await EnterpriseExecution.find(filter)
      .sort(sort)
      .skip(query.offset)
      .limit(query.limit)
      .lean();
    return {
      items: docs as unknown as ExecutionResource[],
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async update(execution: ExecutionResource): Promise<void> {
    await this.save(execution);
  }
}

export class MongoArtifactRepository implements IArtifactRepository {
  async save(
    executionId: string,
    organizationId: string,
    artifacts: readonly ExecutionArtifactRef[]
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const artifact of artifacts) {
      await EnterpriseArtifact.updateOne(
        { artifactId: artifact.artifactId },
        {
          $set: {
            artifactId: artifact.artifactId,
            executionId,
            organizationId,
            kind: artifact.kind,
            label: artifact.label,
            updatedAt: now,
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }
  }

  async list(executionId: string): Promise<readonly ExecutionArtifactRef[]> {
    const docs = await EnterpriseArtifact.find({ executionId }).lean();
    return docs.map((d) => ({
      artifactId: d.artifactId,
      kind: d.kind,
      label: d.label,
    }));
  }

  async get(artifactId: string) {
    const doc = await EnterpriseArtifact.findOne({ artifactId }).lean();
    if (!doc) return undefined;
    return {
      artifact: {
        artifactId: doc.artifactId,
        kind: doc.kind,
        label: doc.label,
      },
      organizationId: doc.organizationId,
      executionId: doc.executionId,
    };
  }
}

export class MongoExecutionExtrasRepository implements IExecutionExtrasRepository {
  async save(
    executionId: string,
    organizationId: string,
    extras: {
      diagnostics: ExecutionDiagnostics;
      trace: ExecutionTraceSummary;
      cost: ExecutionCostSummary;
      evaluation: ExecutionEvaluationSummary;
      experience: ExecutionExperienceSummary;
      osLifecycle?: string;
      governance?: unknown;
      asyncLane?: unknown;
    }
  ): Promise<void> {
    await EnterpriseExecutionExtras.updateOne(
      { executionId },
      {
        $set: {
          executionId,
          organizationId,
          ...extras,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }

  async get(executionId: string) {
    const doc = await EnterpriseExecutionExtras.findOne({ executionId }).lean();
    if (!doc) return undefined;
    const {
      diagnostics,
      trace,
      cost,
      evaluation,
      experience,
      osLifecycle,
      governance,
      asyncLane,
      createMetadataSnapshot,
      executionSpecSnapshot,
    } = doc;
    return {
      diagnostics,
      trace,
      cost,
      evaluation,
      experience,
      ...(osLifecycle != null ? { osLifecycle } : {}),
      ...(governance != null ? { governance } : {}),
      ...(asyncLane != null ? { asyncLane } : {}),
      ...(createMetadataSnapshot != null ? { createMetadataSnapshot } : {}),
      ...(executionSpecSnapshot != null ? { executionSpecSnapshot } : {}),
    };
  }
}
