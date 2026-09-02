/**
 * Step 14A — Production execution trace (deterministic, zero paid API calls).
 */

import {
  beginExecutionTrace,
  recordExecutionTraceStage,
  updateExecutionTrace,
  getExecutionTrace,
  resetExecutionTracesForTests,
  buildExecutionTraceSummary,
  finalizeExecutionTrace,
  recordProviderDispatchFromSummary,
  recordWebsiteMaterializationTrace,
  recordProductionEvidenceTrace,
  EXECUTION_TRACE_PREFIX,
} from "../../../src/platform/os/observability/execution-trace";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

describe("Step 14A — Production execution trace", () => {
  const executionId = "exec_trace_test";
  const correlationId = "corr_trace_test";

  beforeEach(() => {
    resetExecutionTracesForTests();
  });

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("traces a complete website lifecycle with consistent IDs", () => {
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      capabilityId: "text.generate",
      requestedProviderId: "provider.openai",
      requestedModelId: "openai/gpt-4o",
      adaptiveRoutingEnabled: false,
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });

    recordExecutionTraceStage({
      executionId,
      stage: "static_routing",
      status: "COMPLETED",
      details: Object.freeze({
        selectedProviderId: "provider.openai",
        selectedModelId: "openai/gpt-4o",
      }),
    });
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
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        structuredData: { routes: [] },
      }),
      workingMetadata: Object.freeze({
        structuredOutput: { name: "WebsiteRoutes" },
        preferredProviderId: "provider.openai",
        preferredModelId: "openai/gpt-4o",
      }),
    });

    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: true,
      artifactIds: ["art_web_1", "art_web_2"],
      finalProviderId: "provider.openai",
      finalModelId: "openai/gpt-4o",
    });

    recordProductionEvidenceTrace({
      executionId,
      contractValidationStatus: "FAIL",
      evaluationStatus: "FAIL",
      qualityScore: 25,
      evidenceSource: "production",
      evidenceMode: "observational",
      performanceRecordId: "perfrec_trace_1",
      finalOutcome: "MODEL_QUALITY_FAILURE",
      providerSuccess: true,
      stageTrace: Object.freeze({
        artifactHydration: "COMPLETED",
        evaluationPlane: "COMPLETED",
        hydratedArtifactCount: 2,
      }),
    });

    const finalized = getExecutionTrace(executionId);
    expect(finalized).toBeUndefined();
  });

  it("distinguishes requested, selected, and actual models", () => {
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      requestedProviderId: "provider.anthropic",
      requestedModelId: "anthropic/claude-sonnet-4-5",
      adaptiveRoutingEnabled: false,
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    updateExecutionTrace({
      executionId,
      patch: Object.freeze({
        selectedProviderId: "provider.openai",
        selectedModelId: "openai/gpt-4o",
      }),
    });
    recordProviderDispatchFromSummary({
      executionId,
      status: "succeeded",
      jobSummary: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        structuredData: { ok: true },
      }),
      workingMetadata: Object.freeze({ structuredOutput: { name: "WebsiteRoutes" } }),
    });
    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: true,
      artifactIds: ["art_1"],
      finalProviderId: "provider.openai",
      finalModelId: "openai/gpt-4o",
    });

    const state = getExecutionTrace(executionId)!;
    const summary = buildExecutionTraceSummary(state);
    expect(summary).toContain("requestedModel=provider.anthropic/anthropic/claude-sonnet-4-5");
    expect(summary).toContain("selectedModel=provider.openai/openai/gpt-4o");
    expect(summary).toContain("actualModel=provider.openai/openai/gpt-4o");
  });

  it("reports skipped stages explicitly without inferring PASS", () => {
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      adaptiveRoutingEnabled: false,
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    recordExecutionTraceStage({
      executionId,
      stage: "adaptive_routing",
      status: "SKIPPED",
      skipReason: "ADAPTIVE_ROUTING_DISABLED",
    });

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    recordProductionEvidenceTrace({
      executionId,
      providerSuccess: true,
      performanceRecordId: "perfrec_skip",
      contractValidationStatus: "FAIL",
      evidenceSource: "production",
      evidenceMode: "observational",
      finalOutcome: "MODEL_QUALITY_FAILURE",
      stageTrace: Object.freeze({
        artifactHydration: "SKIPPED",
        artifactHydrationReason: "no_media_artifact_ids",
        evaluationPlane: "SKIPPED",
        evaluationPlaneReason: "no_media_artifact_ids",
        hydratedArtifactCount: 0,
      }),
    });
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(`${EXECUTION_TRACE_PREFIX}`);
    expect(output).toContain("routing=STATIC");
    expect(getExecutionTrace(executionId)).toBeUndefined();
    logSpy.mockRestore();
  });

  it("records structured_output as FAILED when requested but missing", () => {
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    recordProviderDispatchFromSummary({
      executionId,
      status: "succeeded",
      jobSummary: Object.freeze({ providerId: "provider.openai", modelId: "openai/gpt-4o" }),
      workingMetadata: Object.freeze({ structuredOutput: { name: "WebsiteRoutes" } }),
    });

    const state = getExecutionTrace(executionId)!;
    const structured = state.stages.find((s) => s.stage === "structured_output");
    expect(structured?.status).toBe("FAILED");
    expect(structured?.error).toBe("structured_output_missing");
  });

  it("never throws when trace state is missing", () => {
    expect(() =>
      recordExecutionTraceStage({
        executionId: "exec_missing",
        stage: "provider_dispatch",
        status: "COMPLETED",
      }),
    ).not.toThrow();
    expect(() =>
      updateExecutionTrace({
        executionId: "exec_missing",
        patch: { executionStatus: "SUCCESS" },
      }),
    ).not.toThrow();
    expect(() => finalizeExecutionTrace("exec_missing")).not.toThrow();
  });

  it("emits compact final trace summary with required fields", () => {
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      requestedProviderId: "provider.openai",
      requestedModelId: "openai/gpt-4o",
      adaptiveRoutingEnabled: false,
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: true,
      artifactIds: ["art_final"],
      finalProviderId: "provider.openai",
      finalModelId: "openai/gpt-4o",
    });
    updateExecutionTrace({
      executionId,
      patch: Object.freeze({
        contractValidationStatus: "FAIL",
        qualityScore: 25,
        performanceRecordId: "perfrec_final",
        finalOutcome: "MODEL_QUALITY_FAILURE",
        executionStatus: "SUCCESS",
        routingMode: "static",
      }),
    });
    recordExecutionTraceStage({
      executionId,
      stage: "model_performance_record",
      status: "COMPLETED",
    });

    const state = getExecutionTrace(executionId)!;
    const summary = buildExecutionTraceSummary(state);
    expect(summary).toContain(`executionId=${executionId}`);
    expect(summary).toContain(`correlationId=${correlationId}`);
    expect(summary).toContain("service=website");
    expect(summary).toContain("subtype=landing-page");
    expect(summary).toContain("artifact=CREATED");
    expect(summary).toContain("artifactId=art_final");
    expect(summary).toContain("contract=FAIL");
    expect(summary).toContain("quality=25");
    expect(summary).toContain("evidence=RECORDED");
    expect(summary).toContain("routing=STATIC");
  });

  it("lists all expected lifecycle stages when fully traced", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    beginExecutionTrace({
      requestId: correlationId,
      executionId,
      correlationId,
      service: "website",
      subtype: "landing-page",
      outputKind: "deferred_website",
      usedStructuredOutput: true,
      usedOsArtifactPipeline: true,
    });
    recordExecutionTraceStage({ executionId, stage: "static_routing", status: "COMPLETED" });
    recordExecutionTraceStage({
      executionId,
      stage: "adaptive_routing",
      status: "SKIPPED",
      skipReason: "ADAPTIVE_ROUTING_DISABLED",
    });
    recordProviderDispatchFromSummary({
      executionId,
      status: "succeeded",
      jobSummary: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        structuredData: {},
      }),
      workingMetadata: Object.freeze({ structuredOutput: { name: "WebsiteRoutes" } }),
    });
    recordWebsiteMaterializationTrace({
      executionId,
      exported: true,
      websiteRequired: true,
      artifactIds: ["art_1"],
    });
    recordProductionEvidenceTrace({
      executionId,
      providerSuccess: true,
      performanceRecordId: "perfrec_stages",
      contractValidationStatus: "FAIL",
      evidenceSource: "production",
      evidenceMode: "observational",
      stageTrace: Object.freeze({
        artifactHydration: "COMPLETED",
        evaluationPlane: "COMPLETED",
        hydratedArtifactCount: 1,
      }),
    });

    expect(getExecutionTrace(executionId)).toBeUndefined();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain(EXECUTION_TRACE_PREFIX);
    expect(output).toContain("evidence=RECORDED");
    logSpy.mockRestore();
  });
});
