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

export class MongoExecutionRepository implements IExecutionRepository {
  async save(execution: ExecutionResource): Promise<void> {
    await EnterpriseExecution.updateOne(
      { executionId: execution.executionId },
      { $set: execution },
      { upsert: true }
    );
  }

  async get(executionId: string): Promise<ExecutionResource | undefined> {
    const doc = await EnterpriseExecution.findOne({ executionId }).lean();
    if (!doc) return undefined;
    return doc as unknown as ExecutionResource;
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
    return {
      diagnostics: doc.diagnostics,
      trace: doc.trace,
      cost: doc.cost,
      evaluation: doc.evaluation,
      experience: doc.experience,
      ...(doc.osLifecycle != null ? { osLifecycle: doc.osLifecycle } : {}),
      ...(doc.governance != null ? { governance: doc.governance } : {}),
      ...(doc.asyncLane != null ? { asyncLane: doc.asyncLane } : {}),
    };
  }
}
