/**
 * CDF execution authority — contract wins over product-map / ExecutionSpec image kinds.
 * Regression shape: cdf_mtzn5273_zx311y8o / exec_16_1789293571773
 * (routes text + CdfSocialMediaRoutes must never become outputKind=image / PNG).
 */

import {
  applyCdfExecutionAuthority,
  CDF_EXECUTION_CONTRACT_CONFLICT,
  CDF_EXECUTION_AUTHORITY_META,
  outputKindFromCdfContract,
  cdfContractIsNonVisual,
} from "../../../src/platform/cdf/execution-authority";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { resolveCanonicalAssemblyEnrichments } from "../../../src/platform/cdf/generation-context/resolve-assembly-enrichments";
import { stampCanonicalStructuredOutputMetadata } from "../../../src/platform/cdf/structured-output-contract";
import {
  beginExecutionTrace,
  getExecutionTrace,
  recordProviderDispatchFromSummary,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import { buildProductionExecutionIntegrity } from "../../../src/platform/os/observability/production-execution-integrity";
import {
  buildIntegrationJobSummary,
  CDF_STRUCTURED_OUTPUT_MISSING,
} from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";

describe("CDF execution authority", () => {
  afterEach(() => {
    resetExecutionTracesForTests();
  });

  it("social-media routes contract maps to text, not image", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "routes",
    });
    expect(contract).toBeDefined();
    expect(contract!.generationModality).toBe("text");
    expect(contract!.artifactKey).toBe("social-media.routes");
    expect(outputKindFromCdfContract(contract!)).toBe("text");
    expect(cdfContractIsNonVisual(contract!)).toBe(true);
  });

  it("overwrites product-map image kind with CDF text authority", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfSessionId: "cdf_mtzn5273_zx311y8o",
        cdfExecutionStrategy: "canonical",
        service: "social",
        subtype: "content-design",
        outputKind: "image",
        outputModalities: ["image"],
        exampleDeliverable: "PNG/JPG",
      },
      proposedOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(true);
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.outputModalities).toEqual(["text"]);
    expect(result.metadata.skipOutputRequirements).toBe(true);
    expect(result.metadata.cdfSkipImageProductionSpec).toBe(true);
    expect(result.metadata[CDF_EXECUTION_AUTHORITY_META.applied]).toBe(true);
    expect(result.metadata[CDF_EXECUTION_AUTHORITY_META.generationModality]).toBe(
      "text",
    );
  });

  it("defers incompatible ExecutionSpec deliverables; CDF text remains authoritative", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfSessionId: "cdf_mtzn5273_zx311y8o",
        service: "social",
        subtype: "content-design",
        outputKind: "image",
        executionSpecDeliverables: ["PNG", "JPG"],
      },
      proposedOutputKind: "image",
      executionSpecOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(true);
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.cdfExecutionSpecConflict).toBe(true);
    expect(result.deferredConflict?.code).toBe(CDF_EXECUTION_CONTRACT_CONFLICT);
    expect(result.metadata.cdfDeferredIncompatibleSpecOutputKind).toBe("image");
  });

  it("skips image production Spec enrichments for non-visual CDF", () => {
    const authority = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfSessionId: "cdf_mtzn5273_zx311y8o",
        service: "social",
        subtype: "content-design",
        outputKind: "image",
      },
      proposedOutputKind: "image",
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    const enrichments = resolveCanonicalAssemblyEnrichments(authority.metadata);
    expect(enrichments.productionSpec).toBeUndefined();
    expect(enrichments.outputRequirements).toBeUndefined();
    expect(enrichments.metadata.cdfSkipImageProductionSpec).toBe(true);
  });

  it("stamps CdfSocialMediaRoutes schema and overwrites wrong product schema", () => {
    const stamped = stampCanonicalStructuredOutputMetadata({
      cdfServiceId: "social-media",
      cdfPhaseId: "routes",
      structuredOutput: {
        name: "LaunchPlan",
        schema: { type: "object", properties: { title: { type: "string" } } },
        strict: true,
      },
    });
    expect(
      (stamped.structuredOutput as { name: string }).name,
    ).toBe("CdfSocialMediaRoutes");
    expect(
      (stamped.structuredOutput as { schema: unknown }).schema,
    ).toBeTruthy();
  });

  it("does not mark structured_output FAILED while provider is still queued", () => {
    beginExecutionTrace({
      requestId: "corr_inflight",
      executionId: "exec_16_1789293571773",
      correlationId: "corr_inflight",
      usedStructuredOutput: true,
    });
    recordProviderDispatchFromSummary({
      executionId: "exec_16_1789293571773",
      status: "queued",
      jobSummary: Object.freeze({}),
      workingMetadata: Object.freeze({
        structuredOutput: { name: "CdfSocialMediaRoutes", schema: {} },
      }),
    });
    const stage = getExecutionTrace("exec_16_1789293571773")!.stages.find(
      (s) => s.stage === "structured_output",
    );
    expect(stage?.status).toBe("SKIPPED");
    expect(stage?.skipReason).toBe("provider_not_terminal");

    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_16_1789293571773",
      correlationId: "corr_inflight",
      service: "social",
      subtype: "content-design",
      outputKind: "text",
      providerIdentity: Object.freeze({}),
      structuredOutputRequested: true,
      structuredDataPresent: false,
      providerLifecycleComplete: false,
      allowMissingArtifacts: true,
    });
    expect(integrity.structuredOutputStatus).not.toBe("FAILED");
    expect(integrity.integrityStatus).not.toBe("FAIL");
  });

  it("canonical image phase keeps image authority", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfSessionId: "cdf_test",
        service: "social",
        subtype: "content-design",
        outputKind: "image",
      },
      proposedOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("image");
    expect(result.metadata.cdfSkipImageProductionSpec).not.toBe(true);
  });
});

describe("CDF structured output missing fail-closed", () => {
  function minimalReport(
    patch: Partial<DirectExecutionReport> & {
      success: boolean;
      metadata?: Record<string, unknown>;
      structured?: unknown;
    },
  ): DirectExecutionReport {
    return {
      success: patch.success,
      resultId: "res_1",
      durationMs: 10,
      stagesCompleted: ["provider_runtime"],
      request: {
        requestId: "req_1",
        organizationId: "org_1",
        prompt: "directions",
        metadata: patch.metadata ?? {},
      } as DirectExecutionReport["request"],
      artifacts: {
        runtime: {
          response: {
            providerId: "provider.openai",
            output: patch.structured
              ? { structured: patch.structured }
              : { text: "prose only" },
            usage: {},
          },
          finalProviderId: "provider.openai",
          finalModelId: "gpt-5.5",
          statistics: { totalMs: 10 },
          attemptHistory: [],
          failoverCount: 0,
        },
        routing: {
          plan: {
            primary: {
              providerId: "provider.openai",
              modelId: "gpt-5.5",
            },
          },
        },
        task: { capabilityMap: { primary: "text.generate" } },
      },
      trace: { stages: [] },
    } as unknown as DirectExecutionReport;
  }

  it("marks success=false when emission phase has no structuredData", () => {
    const summary = buildIntegrationJobSummary({
      report: minimalReport({
        success: true,
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "routes",
          apiExecutionId: "exec_16_1789293571773",
          structuredOutput: {
            name: "CdfSocialMediaRoutes",
            schema: { type: "object" },
          },
        },
      }),
      executionMode: "live",
      durationMs: 10,
    });
    expect(summary.success).toBe(false);
    expect(String(summary.errorMessage)).toContain(CDF_STRUCTURED_OUTPUT_MISSING);
    expect(
      (summary.cdfStructuredOutputMissing as { reason: string })?.reason,
    ).toBe(CDF_STRUCTURED_OUTPUT_MISSING);
  });

  it("keeps success when structuredData is present", () => {
    const summary = buildIntegrationJobSummary({
      report: minimalReport({
        success: true,
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "routes",
          structuredOutput: {
            name: "CdfSocialMediaRoutes",
            schema: { type: "object" },
          },
        },
        structured: {
          routes: [
            { name: "A", idea: "one" },
            { name: "B", idea: "two" },
            { name: "C", idea: "three" },
          ],
        },
      }),
      executionMode: "live",
      durationMs: 10,
    });
    expect(summary.success).toBe(true);
    expect(summary.structuredData).toBeTruthy();
  });
});
