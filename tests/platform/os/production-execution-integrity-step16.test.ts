/**
 * Step 16 — Production execution integrity (deterministic, zero paid API calls).
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
  buildExecutionTraceSummary,
  getExecutionTrace,
  EXECUTION_TRACE_PREFIX,
} from "../../../src/platform/os/observability/execution-trace";
import {
  buildProductionExecutionIntegrity,
  logProductionExecutionIntegrity,
  resolveActualProviderIdentity,
  verifyArtifactIdentityContinuity,
  verifyOutputKindConsistency,
  verifyProviderIdentityConsistency,
  verifyTraceStageConsistency,
  EXECUTION_INTEGRITY_PREFIX,
} from "../../../src/platform/os/observability/production-execution-integrity";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";
import { ingestProductionEvidenceAndShadow } from "../../../src/platform/providers/routing/performance/benchmark/production/production-evidence-service";
import { InMemoryBenchmarkPerformanceRecordStore } from "../../../src/platform/providers/routing/performance/benchmark/persistence/benchmark-record-store";
import {
  filterValidComparisonRecords,
  isObservationalProductionRecord,
} from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";
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

function baseValidation() {
  return Object.freeze({
    contractId: "contract.test",
    contractVersion: "1.0.0",
    effectiveContractId: "contract.test",
    status: "PASS" as const,
    completionAllowed: true,
    qualityScore: 75,
    hardRequirementSummary: Object.freeze({ passed: 1, failed: 0, total: 1, unverified: 0 }),
    qualityDimensions: Object.freeze([]),
    failureSummary: Object.freeze({ failures: Object.freeze([]) }),
    requirementStatuses: Object.freeze([]),
    requirements: Object.freeze([]),
    provenance: Object.freeze([]),
  });
}

function traceLifecycle(input?: {
  readonly withArtifacts?: boolean;
  readonly withEvaluation?: boolean;
  readonly withStep2?: boolean;
  readonly withRecord?: boolean;
}) {
  const executionId = "exec_step16";
  beginExecutionTrace({
    requestId: "corr_step16",
    executionId,
    correlationId: "corr_step16",
    service: "copywriting",
    subtype: "social-post",
    outputKind: "text",
    requestedProviderId: "provider.openai",
    requestedModelId: "openai/gpt-4o",
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
      selectedProviderId: "provider.openai",
      selectedModelId: "openai/gpt-4o",
      routingMode: "static",
    }),
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
  if (input?.withArtifacts) {
    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: false,
      artifactIds: ["art_exec_1"],
    });
  }
  if (input?.withEvaluation || input?.withStep2 || input?.withRecord) {
    recordProductionEvidenceTrace({
      executionId,
      providerSuccess: true,
      contractValidationStatus: "PASS",
      evidenceSource: "production",
      evidenceMode: "observational",
      performanceRecordId: input?.withRecord ? "perfrec_step16" : undefined,
      step2Executed: input?.withStep2 ?? false,
      evidenceRecorded: input?.withRecord ?? false,
      stageTrace: Object.freeze({
        artifactHydration: input?.withEvaluation ? "COMPLETED" : "SKIPPED",
        artifactHydrationReason: input?.withEvaluation ? undefined : "no_media_artifact_ids",
        evaluationPlane: input?.withEvaluation ? "COMPLETED" : "SKIPPED",
        evaluationPlaneReason: input?.withEvaluation ? undefined : "no_media_artifact_ids",
        hydratedArtifactCount: input?.withEvaluation ? 1 : 0,
      }),
    });
  }
  return executionId;
}

describe("Step 16 — Production execution integrity", () => {
  beforeEach(() => {
    resetExecutionTracesForTests();
    validateOutputContractMock.mockReset();
    runArtifactEvaluationMock.mockReset();
  });

  it("A. successful text execution integrity passes", () => {
    const executionId = traceLifecycle();
    const trace = getExecutionTrace(executionId)!;
    const integrity = buildProductionExecutionIntegrity({
      executionId,
      correlationId: "corr_step16",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      providerIdentity: Object.freeze({
        requestedProviderId: "provider.openai",
        requestedModelId: "openai/gpt-4o",
        selectedProviderId: "provider.openai",
        selectedModelId: "openai/gpt-4o",
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
        fallbackUsed: false,
      }),
      trace,
      validationExecuted: true,
      evidenceRecorded: true,
      performanceRecordId: "perfrec_step16",
    });
    expect(integrity.integrityStatus).toBe("PASS");
  });

  it("B. successful artifact-producing execution tracks artifact continuity", () => {
    const failure = verifyArtifactIdentityContinuity({
      executionArtifactIds: ["art_exec_1"],
      persistedArtifactIds: ["art_exec_1"],
      hydratedArtifactIds: ["art_exec_1"],
      recordArtifactIds: ["art_exec_1"],
    });
    expect(failure).toBeUndefined();
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_art",
      correlationId: "corr_art",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      providerIdentity: Object.freeze({
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
      }),
      mediaArtifactIds: ["art_exec_1"],
      validationExecuted: true,
      evaluationPlaneExecuted: true,
      artifactHydrated: true,
      artifactEvaluated: true,
      evidenceRecorded: true,
      performanceRecordId: "perfrec_art",
    });
    expect(integrity.artifactPersisted).toBe(true);
    expect(integrity.artifactHydrated).toBe(true);
  });

  it("C. missing artifact reports MISSING not CREATED", () => {
    beginExecutionTrace({
      requestId: "corr_missing",
      executionId: "exec_missing",
      correlationId: "corr_missing",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
    });
    const summary = buildExecutionTraceSummary(getExecutionTrace("exec_missing")!);
    expect(summary).toContain("artifact=MISSING");
  });

  it("D. artifact persistence failure is detected", () => {
    expect(
      verifyArtifactIdentityContinuity({
        executionArtifactIds: ["art_exec_1"],
        persistedArtifactIds: [],
      }),
    ).toBe("ARTIFACT_PERSISTENCE_FAILURE");
  });

  it("E. artifact hydration failure is detected", () => {
    expect(
      verifyArtifactIdentityContinuity({
        executionArtifactIds: ["art_exec_1"],
        persistedArtifactIds: ["art_exec_1"],
        hydratedArtifactIds: [],
      }),
    ).toBe("ARTIFACT_HYDRATION_FAILURE");
  });

  it("F. evaluation plane unavailable reports SKIPPED not COMPLETED", () => {
    const executionId = traceLifecycle();
    const integrity = buildProductionExecutionIntegrity({
      executionId,
      correlationId: "corr_step16",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      providerIdentity: Object.freeze({}),
      evaluationPlaneExecuted: false,
    });
    expect(integrity.evaluationPlaneStatus).not.toBe("COMPLETED");
  });

  it("G. evaluation failure is classified", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_eval_fail",
      correlationId: "corr_eval_fail",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      providerIdentity: Object.freeze({}),
      trace: Object.freeze({
        requestId: "corr_eval_fail",
        executionId: "exec_eval_fail",
        correlationId: "corr_eval_fail",
        stages: Object.freeze([
          Object.freeze({
            stage: "evaluation_plane" as const,
            status: "FAILED" as const,
            at: new Date().toISOString(),
            error: "plane_failed",
          }),
        ]),
      }),
    });
    expect(integrity.integrityFailures).toContain("EVALUATION_FAILURE");
  });

  it("H. step2 failure is classified", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_step2_fail",
      correlationId: "corr_step2_fail",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      providerIdentity: Object.freeze({}),
      validationExecuted: true,
      trace: Object.freeze({
        requestId: "corr_step2_fail",
        executionId: "exec_step2_fail",
        correlationId: "corr_step2_fail",
        usedStep2Validation: true,
        stages: Object.freeze([
          Object.freeze({
            stage: "step2_validation" as const,
            status: "FAILED" as const,
            at: new Date().toISOString(),
          }),
        ]),
      }),
    });
    expect(integrity.integrityFailures).toContain("TRACE_INCONSISTENCY");
  });

  it("I. provider fallback is recorded from job summary", () => {
    const summary = buildIntegrationJobSummary({
      report: Object.freeze({
        resultId: "res_1",
        requestId: "req_1",
        request: Object.freeze({ requestId: "req_1", rawPrompt: "test" }),
        artifacts: Object.freeze({
          routing: Object.freeze({
            plan: Object.freeze({
              primary: Object.freeze({
                providerId: "provider.anthropic",
                modelId: "anthropic/claude-sonnet-4-5",
              }),
            }),
          }),
          runtime: Object.freeze({
            requestId: "req_1",
            sessionId: "sess_1",
            status: "completed",
            success: true,
            finalProviderId: "provider.openai",
            finalModelId: "openai/gpt-5.5",
            failoverCount: 1,
            response: Object.freeze({
              requestId: "req_1",
              providerId: "provider.openai",
              output: Object.freeze({ content: "ok" }),
              streamed: false,
              finishedAt: new Date().toISOString(),
            }),
            statistics: Object.freeze({ totalMs: 100 }),
            completedAt: new Date().toISOString(),
          }),
        }),
        trace: Object.freeze({
          traceId: "trace_1",
          correlationId: "corr_1",
          requestId: "req_1",
          stages: Object.freeze([]),
          bridges: Object.freeze([]),
          completedStages: Object.freeze(["provider_runtime"]),
          capturedAt: new Date().toISOString(),
        }),
        stagesCompleted: Object.freeze(["provider_runtime"]),
        success: true,
        durationMs: 100,
        createdAt: new Date().toISOString(),
        version: "1",
      }) as DirectExecutionReport,
      executionMode: "live",
      durationMs: 100,
    });
    expect(summary.fallbackUsed).toBe(true);
    expect(summary.actualProviderId).toBe("provider.openai");
    expect(summary.actualModelId).toBe("openai/gpt-5.5");
    const identity = resolveActualProviderIdentity(summary);
    expect(identity.fallbackUsed).toBe(true);
    expect(identity.actualProviderId).toBe("provider.openai");
  });

  it("J. requested vs actual provider mismatch without fallback fails integrity", () => {
    expect(
      verifyProviderIdentityConsistency(
        Object.freeze({
          selectedProviderId: "provider.anthropic",
          selectedModelId: "anthropic/claude-sonnet-4-5",
          actualProviderId: "provider.openai",
          actualModelId: "openai/gpt-5.5",
          fallbackUsed: false,
        }),
      ),
    ).toBe("PROVIDER_IDENTITY_MISMATCH");
  });

  it("K. output-kind mismatch is detected", () => {
    expect(
      verifyOutputKindConsistency({
        service: "website",
        subtype: "landing-page",
        declaredOutputKind: "text",
      }),
    ).toBe("OUTPUT_KIND_MISMATCH");
  });

  it("L. missing structured output fails integrity", () => {
    beginExecutionTrace({
      requestId: "corr_struct",
      executionId: "exec_struct",
      correlationId: "corr_struct",
      usedStructuredOutput: true,
    });
    recordProviderDispatchFromSummary({
      executionId: "exec_struct",
      status: "succeeded",
      jobSummary: Object.freeze({
        actualProviderId: "provider.openai",
        actualModelId: "openai/gpt-4o",
      }),
      workingMetadata: Object.freeze({ structuredOutput: { name: "WebsiteRoutes" } }),
    });
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_struct",
      correlationId: "corr_struct",
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      providerIdentity: Object.freeze({}),
      trace: getExecutionTrace("exec_struct"),
      structuredOutputRequested: true,
      structuredDataPresent: false,
    });
    expect(integrity.structuredOutputStatus).toBe("FAILED");
    expect(integrity.integrityFailures).toContain("STRUCTURED_OUTPUT_FAILURE");
  });

  it("M. evidence persistence failure is detected", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_evidence_fail",
      correlationId: "corr_evidence_fail",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
      providerIdentity: Object.freeze({}),
      evidenceRecorded: false,
    });
    expect(integrity.performanceRecordStatus).toBe("FAILED");
    expect(integrity.integrityFailures).toContain("EVIDENCE_PERSISTENCE_FAILURE");
  });

  it("N. explicit SKIPPED stages are reported in trace summary", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    beginExecutionTrace({
      requestId: "corr_skip",
      executionId: "exec_skip",
      correlationId: "corr_skip",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
    });
    recordProductionEvidenceTrace({
      executionId: "exec_skip",
      providerSuccess: true,
      performanceRecordId: "perfrec_skip",
      evidenceRecorded: true,
      step2Executed: true,
      stageTrace: Object.freeze({
        artifactHydration: "SKIPPED",
        artifactHydrationReason: "no_media_artifact_ids",
        evaluationPlane: "SKIPPED",
        evaluationPlaneReason: "no_media_artifact_ids",
        hydratedArtifactCount: 0,
      }),
    });
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("evaluation_plane=SKIPPED(no_media_artifact_ids)");
    logSpy.mockRestore();
  });

  it("O. trace consistency detects hydration without artifacts", () => {
    const failures = verifyTraceStageConsistency(
      Object.freeze({
        requestId: "corr_trace",
        executionId: "exec_trace",
        correlationId: "corr_trace",
        artifactIds: Object.freeze([]),
        stages: Object.freeze([
          Object.freeze({
            stage: "artifact_hydration" as const,
            status: "COMPLETED" as const,
            at: new Date().toISOString(),
          }),
        ]),
      }),
    );
    expect(failures).toContain("TRACE_INCONSISTENCY");
  });

  it("P. observational evidence cannot become comparison evidence", async () => {
    validateOutputContractMock.mockReturnValue(baseValidation());
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_test",
        productionExecutionId: "exec_obs",
        requestId: "corr_obs",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "copywriting",
        subtype: "social-post",
        outputKind: "text",
        preview: "hello world",
        latencyMs: 100,
        providerSuccess: true,
        createId: (p: string) => `${p}_test`,
        nowIso: () => new Date().toISOString(),
      }),
      Object.freeze({ recordStore: store }),
    );
    const records = await store.query({});
    expect(records.length).toBe(1);
    expect(isObservationalProductionRecord(records[0]!)).toBe(true);
    expect(records[0]!.validForModelComparison).toBe(false);
    expect(filterValidComparisonRecords(records)).toHaveLength(0);
  });

  it("emits compact integrity log", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    logProductionExecutionIntegrity(
      buildProductionExecutionIntegrity({
        executionId: "exec_log",
        correlationId: "corr_log",
        service: "copywriting",
        subtype: "social-post",
        outputKind: "text",
        providerIdentity: Object.freeze({
          actualProviderId: "provider.openai",
          actualModelId: "openai/gpt-4o",
        }),
        evidenceRecorded: true,
        performanceRecordId: "perfrec_log",
      }),
    );
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(EXECUTION_INTEGRITY_PREFIX);
    expect(output).toContain("status");
    logSpy.mockRestore();
  });

  it("adaptive routing remains OFF by default", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("trace summary does not claim evaluation COMPLETED when plane skipped", () => {
    beginExecutionTrace({
      requestId: "corr_eval",
      executionId: "exec_eval",
      correlationId: "corr_eval",
      service: "copywriting",
      subtype: "social-post",
      outputKind: "text",
    });
    recordExecutionTraceStage({
      executionId: "exec_eval",
      stage: "evaluation_plane",
      status: "SKIPPED",
      skipReason: "no_media_artifact_ids",
    });
    recordExecutionTraceStage({
      executionId: "exec_eval",
      stage: "step2_validation",
      status: "COMPLETED",
      at: new Date().toISOString(),
    });
    const summary = buildExecutionTraceSummary(getExecutionTrace("exec_eval")!);
    expect(summary).toContain("evaluation_plane=SKIPPED(no_media_artifact_ids)");
    expect(summary).not.toContain("evaluation=COMPLETED");
    expect(summary).toContain(`${EXECUTION_TRACE_PREFIX}`);
  });
});
