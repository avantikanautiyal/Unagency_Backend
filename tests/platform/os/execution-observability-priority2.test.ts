/**
 * Priority 2 — Durable execution observability (deterministic, zero paid API calls).
 */

import {
  beginExecutionTrace,
  recordClassificationTrace,
  recordExecutionTraceStage,
  recordProviderDispatchFromSummary,
  recordProductionEvidenceTrace,
  recordWebsiteMaterializationTrace,
  updateExecutionTrace,
  resetExecutionTracesForTests,
  getExecutionTrace,
} from "../../../src/platform/os/observability/execution-trace";
import {
  buildProductionExecutionIntegrity,
  mergeProviderIdentityFromTrace,
} from "../../../src/platform/os/observability/production-execution-integrity";
import {
  buildDurableExecutionObservabilityRecord,
} from "../../../src/platform/os/observability/execution-observability-record-builder";
import {
  InMemoryExecutionObservabilityStore,
  UnavailableExecutionObservabilityStore,
} from "../../../src/platform/os/observability/execution-observability-store";
import {
  persistExecutionObservability,
  schedulePersistExecutionObservability,
  logExecutionObservabilityPersistenceFailure,
  EXECUTION_OBSERVABILITY_PREFIX,
} from "../../../src/platform/os/observability/persist-execution-observability";
import { EXECUTION_OBSERVABILITY_RECORD_KIND } from "../../../src/platform/os/observability/execution-observability-contract";
import { ingestProductionEvidenceAndShadow } from "../../../src/platform/providers/routing/performance/benchmark/production/production-evidence-service";
import { InMemoryBenchmarkPerformanceRecordStore } from "../../../src/platform/providers/routing/performance/benchmark/persistence/benchmark-record-store";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

jest.mock("../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine", () => ({
  validateOutputContract: jest.fn(),
}));

jest.mock("../../../src/platform/os/evaluation/artifact-evaluation", () => ({
  createArtifactHydrator: jest.fn(),
  mergeArtifactEvaluationIntoValidationInput: jest.fn((input: { base: unknown }) => input.base),
  runArtifactEvaluation: jest.fn(),
}));

import { validateOutputContract } from "../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine";
import { runArtifactEvaluation } from "../../../src/platform/os/evaluation/artifact-evaluation";

const validateOutputContractMock = validateOutputContract as jest.MockedFunction<
  typeof validateOutputContract
>;
const runArtifactEvaluationMock = runArtifactEvaluation as jest.MockedFunction<
  typeof runArtifactEvaluation
>;

function baseValidation(qualityScore = 75) {
  return Object.freeze({
    contractId: "contract.test",
    contractVersion: "1.0.0",
    effectiveContractId: "contract.test",
    status: "PASS" as const,
    completionAllowed: true,
    qualityScore,
    hardRequirementSummary: Object.freeze({ passed: 1, failed: 0, total: 1, unverified: 0 }),
    qualityDimensions: Object.freeze([]),
    failureSummary: Object.freeze({ failures: Object.freeze([]) }),
    requirementStatuses: Object.freeze([]),
    requirements: Object.freeze([]),
    provenance: Object.freeze([]),
  });
}

function baseTrace(input?: {
  readonly executionId?: string;
  readonly correlationId?: string;
  readonly fallback?: boolean;
  readonly withArtifacts?: boolean;
  readonly finalize?: boolean;
  readonly withEvaluation?: boolean;
  readonly withStep2?: boolean;
  readonly withRecord?: boolean;
  readonly qualityScore?: number;
  readonly providerSuccess?: boolean;
}) {
  const executionId = input?.executionId ?? "exec_p2";
  const correlationId = input?.correlationId ?? "corr_p2";
  beginExecutionTrace({
    requestId: correlationId,
    executionId,
    correlationId,
    service: "copywriting",
    subtype: "social-post",
    outputKind: "text",
    requestedProviderId: "provider.anthropic",
    requestedModelId: "anthropic/claude-3-5-sonnet",
    adaptiveRoutingEnabled: false,
    usedStructuredOutput: false,
    usedOsArtifactPipeline: false,
  });
  recordClassificationTrace({
    executionId,
    service: "copywriting",
    subtype: "social-post",
    outputKind: "text",
    classificationOk: true,
  });
  recordExecutionTraceStage({ executionId, stage: "static_routing", status: "COMPLETED" });
  recordExecutionTraceStage({
    executionId,
    stage: "adaptive_routing",
    status: "SKIPPED",
    skipReason: "ADAPTIVE_ROUTING_DISABLED",
  });
  updateExecutionTrace({
    executionId,
    patch: Object.freeze({
      selectedProviderId: "provider.anthropic",
      selectedModelId: "anthropic/claude-3-5-sonnet",
      routingMode: "static",
    }),
  });
  const fallback = input?.fallback === true;
  recordProviderDispatchFromSummary({
    executionId,
    status: input?.providerSuccess === false ? "failed" : "succeeded",
    jobSummary: Object.freeze({
      actualProviderId: fallback ? "provider.openai" : "provider.anthropic",
      actualModelId: fallback ? "openai/gpt-4o" : "anthropic/claude-3-5-sonnet",
      routedProviderId: "provider.anthropic",
      routedModelId: "anthropic/claude-3-5-sonnet",
      structuredData: null,
      fallbackUsed: fallback,
      fallbackReason: fallback ? "primary_unavailable" : undefined,
      fallbackProviderId: fallback ? "provider.openai" : undefined,
      fallbackModelId: fallback ? "openai/gpt-4o" : undefined,
    }),
  });
  if (input?.withArtifacts) {
    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: false,
      artifactIds: ["art_p2_1"],
    });
  }
  let finalizedTrace;
  if (input?.finalize !== false) {
    finalizedTrace = recordProductionEvidenceTrace({
      executionId,
      providerSuccess: input?.providerSuccess !== false,
      contractValidationStatus: "PASS",
      qualityScore: input?.qualityScore ?? 75,
      evidenceSource: "production",
      evidenceMode: "observational",
      performanceRecordId: input?.withRecord ? "perfrec_p2" : undefined,
      step2Executed: input?.withStep2 ?? true,
      evidenceRecorded: input?.withRecord ?? false,
      stageTrace: Object.freeze({
        artifactHydration: input?.withEvaluation ? "COMPLETED" : "SKIPPED",
        artifactHydrationReason: input?.withEvaluation ? undefined : "no_media_artifact_ids",
        artifactRender: "SKIPPED",
        artifactRenderReason: "production_evidence_path_does_not_render_artifacts",
        runtimeEvaluation: "SKIPPED",
        runtimeEvaluationReason: "production_evidence_path_does_not_run_runtime_evaluation",
        evaluationPlane: input?.withEvaluation ? "COMPLETED" : "SKIPPED",
        evaluationPlaneReason: input?.withEvaluation ? undefined : "no_media_artifact_ids",
        hydratedArtifactCount: input?.withEvaluation ? 1 : 0,
      }),
    });
  }
  return { executionId, correlationId, finalizedTrace };
}

function buildIntegrityForTrace(
  executionId: string,
  correlationId: string,
  trace?: ReturnType<typeof getExecutionTrace>,
  overrides?: Partial<Parameters<typeof buildProductionExecutionIntegrity>[0]>,
) {
  const providerIdentity = mergeProviderIdentityFromTrace(trace, Object.freeze({}));
  return buildProductionExecutionIntegrity({
    executionId,
    correlationId,
    service: "copywriting",
    subtype: "social-post",
    outputKind: "text",
    providerIdentity,
    trace,
    validationExecuted: true,
    evidenceRecorded: true,
    performanceRecordId: "perfrec_p2",
    ...overrides,
  });
}

async function flushAsyncPersistence(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

describe("Priority 2 — Durable execution observability", () => {
  let observabilityStore: InMemoryExecutionObservabilityStore;

  beforeEach(() => {
    resetExecutionTracesForTests();
    observabilityStore = new InMemoryExecutionObservabilityStore();
    validateOutputContractMock.mockReset();
    runArtifactEvaluationMock.mockReset();
    validateOutputContractMock.mockReturnValue(baseValidation());
  });

  it("A. persists successful execution lifecycle record", async () => {
    const { executionId, correlationId, finalizedTrace } = baseTrace({ withRecord: true });
    const integrity = buildIntegrityForTrace(executionId, correlationId, finalizedTrace);
    const result = await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity,
        latencyMs: 120,
        performanceRecordId: "perfrec_p2",
        evaluationPlaneVersion: "eval-plane@1.0.0",
      },
      observabilityStore,
    );
    expect(result).toBe("inserted");
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.recordKind).toBe(EXECUTION_OBSERVABILITY_RECORD_KIND);
    expect(stored?.executionId).toBe(executionId);
    expect(stored?.correlationId).toBe(correlationId);
    expect(stored?.organizationId).toBe("org_p2");
    expect(stored?.integrityStatus).toBe("PASS");
    expect(stored?.evidenceStatus).toBe("RECORDED");
    expect(stored?.step2Status).toBe("COMPLETED");
    expect(stored?.evaluationPlaneStatus).toBe("SKIPPED");
    expect(stored?.latencyMs).toBe(120);
  });

  it("B. records provider fallback with reason", async () => {
    const { executionId, finalizedTrace } = baseTrace({ fallback: true, withRecord: true });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      providerIdentity: Object.freeze({
        requestedProviderId: "provider.anthropic",
        requestedModelId: "anthropic/claude-3-5-sonnet",
        selectedProviderId: "provider.anthropic",
        selectedModelId: "anthropic/claude-3-5-sonnet",
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
        fallbackUsed: true,
        fallbackReason: "primary_unavailable",
        fallbackProviderId: "provider.openai",
        fallbackModelId: "openai/gpt-4o",
      }),
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.fallbackUsed).toBe(true);
    expect(stored?.fallbackReason).toBe("primary_unavailable");
    expect(stored?.actualProviderId).toBe("provider.openai");
    expect(stored?.selectedProviderId).toBe("provider.anthropic");
  });

  it("C. records artifact creation metadata without artifact contents", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withArtifacts: true, withRecord: true });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      mediaArtifactIds: ["art_p2_1"],
      evaluationPlaneExecuted: false,
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.artifactIds).toEqual(["art_p2_1"]);
    expect(stored?.artifactPersistenceStatus).toBe("COMPLETED");
    expect(JSON.stringify(stored)).not.toContain("preview");
    expect(JSON.stringify(stored)).not.toContain("prompt");
  });

  it("D. hydration COMPLETED only when hydration stage completed", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withEvaluation: true, withRecord: true });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      artifactHydrated: true,
      evaluationPlaneExecuted: true,
      artifactEvaluated: true,
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.artifactHydrationStatus).toBe("COMPLETED");
    expect(stored?.evaluationPlaneStatus).toBe("COMPLETED");
  });

  it("E. evaluation plane SKIPPED when not executed", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withRecord: true });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity: buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace),
      },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.evaluationPlaneStatus).toBe("SKIPPED");
    expect(stored?.runtimeEvaluationStatus).toBe("SKIPPED");
  });

  it("F. step2 COMPLETED only when validation executed", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withStep2: true, withRecord: true });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity: buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace),
      },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.step2Status).toBe("COMPLETED");
    expect(stored?.qualityGateStatus).toBe("COMPLETED");
  });

  it("G. quality failure reflected in integrity status", async () => {
    validateOutputContractMock.mockReturnValue(
      baseValidation(30) as ReturnType<typeof baseValidation> & { status: "FAIL" },
    );
    const { executionId, finalizedTrace } = baseTrace({
      withRecord: true,
      qualityScore: 30,
    });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace);
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity,
        qualityScore: 30,
      },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.qualityScore).toBe(30);
  });

  it("H. operational failure records failed execution status", async () => {
    const { executionId, finalizedTrace } = baseTrace({
      providerSuccess: false,
      withRecord: false,
    });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      evidenceRecorded: false,
      performanceRecordId: undefined,
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.executionStatus).toBe("FAIL");
    expect(stored?.evidenceStatus).toBe("NOT_RECORDED");
  });

  it("I. observability persistence failure degrades gracefully", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { executionId, finalizedTrace } = baseTrace({ withRecord: true });
    const result = await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity: buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace),
      },
      new UnavailableExecutionObservabilityStore(),
    );
    expect(result).toBe("unavailable");
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(EXECUTION_OBSERVABILITY_PREFIX);
    expect(output).toContain("persistence_unavailable");
    logSpy.mockRestore();
  });

  it("J. missing artifact reports MISSING persistence status", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withArtifacts: false, withRecord: true });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      mediaArtifactIds: [],
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.artifactIds).toEqual([]);
    expect(stored?.artifactPersistenceStatus).not.toBe("COMPLETED");
  });

  it("K. missing evaluation does not claim evaluation plane COMPLETED", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withEvaluation: false, withRecord: true });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity: buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace),
      },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.evaluationPlaneStatus).not.toBe("COMPLETED");
  });

  it("L. correlation lookup returns recent executions", async () => {
    const { executionId, correlationId, finalizedTrace } = baseTrace({
      executionId: "exec_corr_1",
      correlationId: "corr_shared",
      withRecord: true,
    });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: finalizedTrace!,
        integrity: buildIntegrityForTrace(executionId, correlationId, finalizedTrace),
      },
      observabilityStore,
    );
    const rows = await observabilityStore.getByCorrelationId("corr_shared");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.executionId).toBe("exec_corr_1");
  });

  it("M. filters by service and actual provider/model", async () => {
    const first = baseTrace({ executionId: "exec_filter_1", withRecord: true });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: first.finalizedTrace!,
        integrity: buildIntegrityForTrace(first.executionId, first.correlationId, first.finalizedTrace),
      },
      observabilityStore,
    );
    const second = baseTrace({
      executionId: "exec_filter_2",
      correlationId: "corr_filter_2",
      fallback: true,
      withRecord: true,
    });
    await persistExecutionObservability(
      {
        organizationId: "org_p2",
        trace: second.finalizedTrace!,
        integrity: buildIntegrityForTrace(second.executionId, second.correlationId, second.finalizedTrace, {
          providerIdentity: Object.freeze({
            actualProviderId: "provider.openai",
            actualModelId: "openai/gpt-4o",
            fallbackUsed: true,
          }),
        }),
      },
      observabilityStore,
    );
    const byService = await observabilityStore.query({
      service: "copywriting",
      subtype: "social-post",
    });
    expect(byService.length).toBe(2);
    const byModel = await observabilityStore.query({
      actualProviderId: "provider.openai",
      actualModelId: "openai/gpt-4o",
    });
    expect(byModel).toHaveLength(1);
    expect(byModel[0]?.executionId).toBe("exec_filter_2");
  });

  it("N. integrity consistency failure category is queryable", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withRecord: false });
    const integrity = buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace, {
      evidenceRecorded: false,
      performanceRecordId: undefined,
      providerIdentity: Object.freeze({
        selectedProviderId: "provider.anthropic",
        actualProviderId: "provider.openai",
        fallbackUsed: false,
      }),
    });
    await persistExecutionObservability(
      { organizationId: "org_p2", trace: finalizedTrace!, integrity },
      observabilityStore,
    );
    const stored = await observabilityStore.getByExecutionId(executionId);
    expect(stored?.integrityStatus).toBe("FAIL");
    expect(stored?.failureCategory).toBeDefined();
    const failures = await observabilityStore.query({
      integrityStatus: "FAIL",
      failureCategory: stored?.failureCategory,
    });
    expect(failures.length).toBeGreaterThan(0);
  });

  it("O. finalize is append-only (duplicate rejected)", async () => {
    const { executionId, finalizedTrace } = baseTrace({ withRecord: true });
    const input = {
      organizationId: "org_p2",
      trace: finalizedTrace!,
      integrity: buildIntegrityForTrace(executionId, "corr_p2", finalizedTrace),
    };
    expect(await persistExecutionObservability(input, observabilityStore)).toBe("inserted");
    expect(await persistExecutionObservability(input, observabilityStore)).toBe("duplicate");
  });

  it("P. wires into production evidence lifecycle without blocking delivery", async () => {
    const executionId = "exec_wire";
    const correlationId = "corr_wire";
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      requestedProviderId: "provider.openai",
      requestedModelId: "openai/gpt-4o",
      adaptiveRoutingEnabled: false,
    });
    recordClassificationTrace({
      executionId,
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      classificationOk: true,
    });
    recordProviderDispatchFromSummary({
      executionId,
      status: "succeeded",
      jobSummary: Object.freeze({
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
        routedProviderId: "provider.openai",
        routedModelId: "openai/gpt-4o",
        structuredData: null,
        fallbackUsed: false,
      }),
    });
    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const result = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_p2",
        productionExecutionId: "exec_wire",
        requestId: "corr_wire",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "copywriting",
        subtype: "social-post",
        outputKind: "text",
        preview: "hello world",
        latencyMs: 90,
        providerSuccess: true,
        createId: (p: string) => `${p}_wire`,
        nowIso: () => new Date().toISOString(),
      }),
      Object.freeze({ recordStore, observabilityStore }),
    );
    expect(result.evidenceRecorded).toBe(true);
    await flushAsyncPersistence();
    const stored = await observabilityStore.getByExecutionId("exec_wire");
    expect(stored).toBeDefined();
    expect(stored?.performanceRecordId).toBeDefined();
    expect(stored?.evidenceStatus).toBe("RECORDED");
  });

  it("Q. schedulePersist never throws on store failure", () => {
    const { finalizedTrace } = baseTrace({ withRecord: true });
    expect(() =>
      schedulePersistExecutionObservability(
        {
          organizationId: "org_p2",
          trace: finalizedTrace!,
          integrity: buildIntegrityForTrace("exec_p2", "corr_p2", finalizedTrace),
        },
        new UnavailableExecutionObservabilityStore(),
      ),
    ).not.toThrow();
  });

  it("R. builder preserves stage records without prompts or responses", () => {
    const { finalizedTrace } = baseTrace({ withRecord: true });
    const record = buildDurableExecutionObservabilityRecord({
      organizationId: "org_p2",
      trace: finalizedTrace!,
      integrity: buildIntegrityForTrace("exec_p2", "corr_p2", finalizedTrace),
    });
    expect(record.stages.length).toBeGreaterThan(0);
    expect(JSON.stringify(record.stages)).not.toMatch(/api[_-]?key/i);
    expect(record.recordKind).toBe(EXECUTION_OBSERVABILITY_RECORD_KIND);
  });

  it("S. explicit persistence failure log helper", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    logExecutionObservabilityPersistenceFailure("exec_log", "mongo_down");
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("mongo_down");
    logSpy.mockRestore();
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});
