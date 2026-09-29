/**
 * Regression: free-text audience must not hard-block canonical completion, and
 * a blocked canonical ingest must surface in trace finalStatus + integrity.
 */

import { extractRequirementsFromSource } from "../../../src/platform/cdf/requirements/extractor";
import { classifyRequirement } from "../../../src/platform/cdf/generation-validation/classify";
import { runRequirementCheck } from "../../../src/platform/cdf/generation-validation/checks";
import type { ArtifactObservation } from "../../../src/platform/cdf/generation-validation/types";
import type { CdfSourceInput } from "../../../src/platform/cdf/requirements/types";
import {
  beginExecutionTrace,
  buildExecutionTraceSummary,
  getExecutionTrace,
  resetExecutionTracesForTests,
  updateExecutionTrace,
} from "../../../src/platform/os/observability/execution-trace";
import { buildProductionExecutionIntegrity } from "../../../src/platform/os/observability/production-execution-integrity";

const PERFORMANCE_ADS_BRIEF =
  "Create an Instagram ad for my brand. Target the marketing agencies asking them if they need a tech partner. Use the proper brand theme and colours";

function observation(textCorpus: string): ArtifactObservation {
  return {
    artifactKey: "ad-campaigns.campaign-strategy",
    textCorpus,
    titles: [],
    sectionTitles: [],
    sectionIds: [],
    colors: [],
    colorKeys: [],
    exactHeadlines: [],
    vaultAssetIds: [],
  } as unknown as ArtifactObservation;
}

describe("audience requirement is semantic, not a substring gate", () => {
  it("does not block a paraphrased strategy for a 'Target …' brief", () => {
    const reqs = extractRequirementsFromSource({
      sessionId: "cdf_test",
      serviceId: "ad-campaigns",
      rawContent: PERFORMANCE_ADS_BRIEF,
      sourceType: "brief",
    } as unknown as CdfSourceInput);
    const audience = reqs.find((r) => r.key === "audience");
    expect(audience).toBeDefined();
    expect(classifyRequirement(audience!).capability).toBe(
      "semantic_review_required",
    );

    const checks = reqs.map((r) =>
      runRequirementCheck(
        r,
        observation(
          "Campaign strategy targeting marketing agencies that need a technology partner.",
        ),
      ),
    );
    expect(
      checks.filter((c) => c.severity === "blocking" && c.status === "fail"),
    ).toEqual([]);
    expect(checks.find((c) => c.requirementKey === "audience")?.status).toBe(
      "semantic_review_required",
    );
  });
});

describe("blocked canonical completion observability", () => {
  const executionId = "exec_blocked_1";

  beforeEach(() => {
    resetExecutionTracesForTests();
    beginExecutionTrace({
      requestId: executionId,
      executionId,
      correlationId: "corr_blocked_1",
      service: "ads",
      subtype: "performance-ads",
      outputKind: "text",
      usedStructuredOutput: true,
    });
    updateExecutionTrace({
      executionId,
      patch: { finalOutcome: "MODEL_SUCCESS", executionStatus: "SUCCESS" },
    });
  });

  it("finalStatus reports the canonical block instead of MODEL_SUCCESS", () => {
    updateExecutionTrace({
      executionId,
      patch: {
        canonicalCompletionBlocked: true,
        canonicalCompletionBlockReason: "VALIDATION_ERROR",
      },
    });
    const summary = buildExecutionTraceSummary(getExecutionTrace(executionId)!);
    expect(summary).toContain("canonical_completion=BLOCKED(VALIDATION_ERROR)");
    expect(summary).toContain(
      "finalStatus=CANONICAL_COMPLETION_BLOCKED(VALIDATION_ERROR)",
    );
    expect(summary).not.toContain("finalStatus=MODEL_SUCCESS");
  });

  it("unblocked executions keep the model-plane finalStatus", () => {
    const summary = buildExecutionTraceSummary(getExecutionTrace(executionId)!);
    expect(summary).toContain("finalStatus=MODEL_SUCCESS");
    expect(summary).not.toContain("canonical_completion=");
  });

  it("integrity FAILs with CANONICAL_COMPLETION_BLOCKED, not provider failure", () => {
    updateExecutionTrace({
      executionId,
      patch: {
        canonicalCompletionBlocked: true,
        canonicalCompletionBlockReason: "VALIDATION_ERROR",
      },
    });
    const integrity = buildProductionExecutionIntegrity({
      executionId,
      correlationId: "corr_blocked_1",
      service: "ads",
      subtype: "performance-ads",
      outputKind: "text",
      providerIdentity: {},
      trace: getExecutionTrace(executionId),
      structuredOutputRequested: true,
      structuredDataPresent: true,
      allowMissingArtifacts: true,
      providerSuccess: false,
    });
    expect(integrity.integrityStatus).toBe("FAIL");
    expect(integrity.failureCategory).toBe("CANONICAL_COMPLETION_BLOCKED");
    expect(integrity.failureReason).toContain("VALIDATION_ERROR");
    expect(integrity.integrityFailures).not.toContain(
      "PROVIDER_EXECUTION_FAILURE",
    );
  });
});
