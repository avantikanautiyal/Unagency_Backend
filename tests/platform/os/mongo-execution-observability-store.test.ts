/**
 * Priority 2 — Mongo execution observability repository tests (no provider calls).
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoExecutionObservabilityStore } from "../../../src/platform/os/observability/mongo-execution-observability-store";
import { EnterpriseExecutionObservability } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-execution-observability.model";
import { EXECUTION_OBSERVABILITY_RECORD_KIND } from "../../../src/platform/os/observability/execution-observability-contract";
import type { DurableExecutionObservabilityRecord } from "../../../src/platform/os/observability/execution-observability-contract";

function sampleRecord(
  overrides?: Partial<DurableExecutionObservabilityRecord>,
): DurableExecutionObservabilityRecord {
  const now = new Date().toISOString();
  return Object.freeze({
    recordKind: EXECUTION_OBSERVABILITY_RECORD_KIND,
    executionId: "exec_mongo_1",
    correlationId: "corr_mongo_1",
    organizationId: "org_mongo",
    service: "copywriting",
    subtype: "social-post",
    outputKind: "text",
    fallbackUsed: false,
    classificationStatus: "COMPLETED",
    structuredOutputStatus: "SKIPPED",
    materializationStatus: "SKIPPED",
    artifactPersistenceStatus: "SKIPPED",
    artifactHydrationStatus: "SKIPPED",
    artifactRenderStatus: "SKIPPED",
    runtimeEvaluationStatus: "SKIPPED",
    evaluationPlaneStatus: "SKIPPED",
    step2Status: "COMPLETED",
    qualityGateStatus: "COMPLETED",
    evidenceStatus: "RECORDED",
    performanceRecordStatus: "COMPLETED",
    artifactIds: Object.freeze([]),
    performanceRecordId: "perfrec_mongo_1",
    executionStatus: "SUCCESS",
    integrityStatus: "PASS",
    integrityFailures: Object.freeze([]),
    stages: Object.freeze([
      Object.freeze({
        stage: "request_intake" as const,
        status: "COMPLETED" as const,
        at: now,
      }),
    ]),
    startedAt: now,
    finalizedAt: now,
    persistedAt: now,
    ...overrides,
  });
}

describe("MongoExecutionObservabilityStore", () => {
  let mongod: MongoMemoryServer;
  let store: MongoExecutionObservabilityStore;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    store = new MongoExecutionObservabilityStore();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await EnterpriseExecutionObservability.deleteMany({});
  });

  it("finalizes once and rejects duplicate executionId", async () => {
    const record = sampleRecord();
    expect(await store.finalize(record)).toBe("inserted");
    expect(await store.finalize(record)).toBe("duplicate");
  });

  it("gets by executionId", async () => {
    const record = sampleRecord();
    await store.finalize(record);
    const loaded = await store.getByExecutionId("exec_mongo_1");
    expect(loaded?.executionId).toBe("exec_mongo_1");
    expect(loaded?.performanceRecordId).toBe("perfrec_mongo_1");
  });

  it("gets by correlationId sorted by finalizedAt desc", async () => {
    const older = sampleRecord({
      executionId: "exec_mongo_old",
      correlationId: "corr_shared_mongo",
      finalizedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = sampleRecord({
      executionId: "exec_mongo_new",
      correlationId: "corr_shared_mongo",
      finalizedAt: "2026-02-01T00:00:00.000Z",
    });
    await store.finalize(older);
    await store.finalize(newer);
    const rows = await store.getByCorrelationId("corr_shared_mongo");
    expect(rows.map((r) => r.executionId)).toEqual(["exec_mongo_new", "exec_mongo_old"]);
  });

  it("queries by service/subtype/provider/status/failure category", async () => {
    await store.finalize(
      sampleRecord({
        executionId: "exec_mongo_pass",
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
        integrityStatus: "PASS",
      }),
    );
    await store.finalize(
      sampleRecord({
        executionId: "exec_mongo_fail",
        correlationId: "corr_mongo_fail",
        actualProviderId: "provider.anthropic",
        actualModelId: "anthropic/claude-3-5-sonnet",
        integrityStatus: "FAIL",
        failureCategory: "PROVIDER_IDENTITY_MISMATCH",
        evidenceStatus: "NOT_RECORDED",
        performanceRecordStatus: "FAILED",
        performanceRecordId: undefined,
      }),
    );
    const byProvider = await store.query({
      actualProviderId: "provider.openai",
      actualModelId: "openai/gpt-4o",
    });
    expect(byProvider).toHaveLength(1);
    expect(byProvider[0]?.executionId).toBe("exec_mongo_pass");

    const byFailure = await store.query({
      integrityStatus: "FAIL",
      failureCategory: "PROVIDER_IDENTITY_MISMATCH",
    });
    expect(byFailure).toHaveLength(1);
    expect(byFailure[0]?.executionId).toBe("exec_mongo_fail");

    const byService = await store.query({
      service: "copywriting",
      subtype: "social-post",
      organizationId: "org_mongo",
    });
    expect(byService.length).toBe(2);
  });

  it("queries evaluation and step2 status filters", async () => {
    await store.finalize(
      sampleRecord({
        executionId: "exec_mongo_eval",
        evaluationPlaneStatus: "COMPLETED",
        step2Status: "COMPLETED",
      }),
    );
    const rows = await store.query({
      evaluationPlaneStatus: "COMPLETED",
      step2Status: "COMPLETED",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.executionId).toBe("exec_mongo_eval");
  });
});
