/**
 * Structured CDF phases must not require media artifacts.
 * Image/video phases still must.
 * No service / phase-ID branches — modality + authority stamps only.
 */

import * as fs from "fs";
import * as path from "path";
import { SpecGuardEvaluator } from "../../../src/platform/os/evaluation/evaluators/spec-guard";
import { createGovernanceFinalizeService } from "../../../src/platform/os/governance/finalize";
import { finalizeExecutionGovernanceExtras } from "../../../src/platform/api/services/execution-governance-extras";
import {
  cdfExecutionRequiresMediaArtifact,
  applyCdfExecutionAuthority,
} from "../../../src/platform/cdf/execution-authority";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { resolveProductionValidationAsync } from "../../../src/platform/providers/routing/performance/benchmark/production/production-validation-resolver";
import { buildProductionExecutionIntegrity } from "../../../src/platform/os/observability/production-execution-integrity";
import {
  beginExecutionTrace,
  buildExecutionTraceSummary,
  recordProductionEvidenceTrace,
  resetExecutionTracesForTests,
} from "../../../src/platform/os/observability/execution-trace";
import { resolveUpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";

const STRUCTURED_SITEMAP = Object.freeze({
  schemaId: "CdfWebsiteSitemap",
  type: "website_sitemap",
  deliverable: "sitemap",
  title: "Recommended sitemap",
  summary: "Home, About, Services, Work, Contact",
  identityMark: "logo",
  globalNavigation: ["Home", "About", "Services", "Work", "Contact"],
  siteHierarchy: [{ page: "Home", children: [] }],
  pageCount: 5,
  globalElements: [],
  transitionAndMotionSystem: {},
  responsiveRules: {},
  linkIntegrity: { ok: true },
  openItemsForApproval: [],
  notes: "",
});

function sitemapUpstream(): UpstreamArtifactContext {
  return {
    artifactId: "cdfart_mu6mirm8_5_web-tech-sitemap",
    version: 1,
    artifactKey: "web-tech.sitemap",
    phaseId: "sitemap",
    role: "approved_content",
    status: "approved",
    schemaVersion: "1",
    data: { ...STRUCTURED_SITEMAP },
    lineage: { sourceArtifacts: [] },
    sessionRole: "generated",
    required: true,
  };
}

describe("CDF structured modality — media N/A (generic)", () => {
  afterEach(() => {
    resetExecutionTracesForTests();
  });

  it("1. structured provider success + valid structured output → SpecGuard PASS (not media BLOCK)", () => {
    const guard = new SpecGuardEvaluator();
    const result = guard.evaluate({
      organizationId: "org_t",
      executionId: "exec_structured_1",
      planId: "plan_1",
      planVersion: 1,
      outputContractId: "output.copy",
      preview: JSON.stringify(STRUCTURED_SITEMAP),
      service: "website",
      subtype: "landing-page",
      outputKind: "document",
      structuredData: STRUCTURED_SITEMAP,
      mediaArtifactIds: [],
      skipOutputRequirements: true,
      generationModality: "structured",
    });
    expect(result.outcome).toBe("PASS");
    expect(
      result.findings.some((f) => f.code === "SPEC_STRUCTURED_PHASE_MEDIA_N_A"),
    ).toBe(true);
  });

  it("2. structured + canonical authority → media not required", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "web-tech",
      phaseId: "sitemap",
    });
    expect(contract?.generationModality).toBe("structured");
    const applied = applyCdfExecutionAuthority({
      metadata: {
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
        cdfSessionId: "cdfsess_test",
        cdfExecutionStrategy: "canonical",
        executionSpecDeliverables: ["EDITABLE_TEXT", "ZIP", "HTML"],
      },
    });
    expect(applied.ok).toBe(true);
    expect(applied.applied).toBe(true);
    expect(cdfExecutionRequiresMediaArtifact(applied.metadata)).toBe(false);
    expect(applied.metadata.skipOutputRequirements).toBe(true);
  });

  it("3. structured phase with zero media artifacts → production validation PASS + N/A stages", async () => {
    const resolved = await resolveProductionValidationAsync({
      context: {
        organizationId: "org_t",
        productionExecutionId: "exec_structured_3",
        requestId: "req_3",
        providerId: "provider.openai",
        modelId: "gpt-5.5",
        capabilityId: "text.generate",
        service: "website",
        subtype: "landing-page",
        outputKind: "document",
        preview: JSON.stringify(STRUCTURED_SITEMAP),
        structuredData: STRUCTURED_SITEMAP,
        mediaArtifactIds: [],
        latencyMs: 100,
        strategyId: "strategy.baseline",
        strategyVersion: "1.0.0",
        metadata: {
          cdfExecutionAuthorityApplied: true,
          cdfAuthorityGenerationModality: "structured",
          cdfAuthorityOutputKind: "document",
          skipOutputRequirements: true,
          cdfArtifactId: "cdfart_mu6mirm8_5_web-tech-sitemap",
          cdfArtifactVersion: 1,
          cdfGeneratedArtifactsBound: true,
          cdfCanonicalCompletionEstablished: true,
        },
        createId: (p) => `${p}_t`,
        nowIso: () => "2026-09-18T00:00:00.000Z",
      },
    });
    expect(resolved.validation?.status).toBe("PASS");
    expect(resolved.validation?.completionAllowed).toBe(true);
    expect(resolved.stageTrace.artifactRender).toBe("NOT_APPLICABLE");
    expect(resolved.stageTrace.artifactHydration).toBe("NOT_APPLICABLE");
    expect(resolved.stageTrace.runtimeEvaluation).toBe("NOT_APPLICABLE");
  });

  it("4. image phase with zero media artifacts → still requires media", () => {
    expect(
      cdfExecutionRequiresMediaArtifact({
        cdfExecutionAuthorityApplied: true,
        cdfAuthorityGenerationModality: "image",
        cdfAuthorityOutputKind: "image",
      }),
    ).toBe(true);
  });

  it("5. video phase with zero media artifacts → still requires media", () => {
    expect(
      cdfExecutionRequiresMediaArtifact({
        cdfExecutionAuthorityApplied: true,
        cdfAuthorityGenerationModality: "video",
        cdfAuthorityOutputKind: "video",
      }),
    ).toBe(true);
  });

  it("6. structured modality without structured data does not claim media-N/A info finding", () => {
    const guard = new SpecGuardEvaluator();
    const result = guard.evaluate({
      organizationId: "org_t",
      executionId: "exec_structured_6",
      planId: "plan_1",
      planVersion: 1,
      outputContractId: "output.copy",
      preview: " ",
      service: "website",
      subtype: "landing-page",
      outputKind: "document",
      mediaArtifactIds: [],
      skipOutputRequirements: true,
      generationModality: "structured",
    });
    expect(
      result.findings.some((f) => f.code === "SPEC_STRUCTURED_PHASE_MEDIA_N_A"),
    ).toBe(false);
    expect(result.outcome).not.toBe("BLOCKED");
  });

  it("7. missing media on image path without allowMissing → not PASS", () => {
    const integrity = buildProductionExecutionIntegrity({
      executionId: "exec_7",
      correlationId: "corr_7",
      service: "website",
      subtype: "landing-page",
      outputKind: "image",
      providerIdentity: {
        actualProviderId: "provider.openai",
        actualModelId: "m",
        selectedProviderId: "provider.openai",
        selectedModelId: "m",
      },
      mediaArtifactIds: [],
      allowMissingArtifacts: false,
      structuredOutputRequested: false,
      structuredDataPresent: false,
      providerSuccess: true,
      providerLifecycleComplete: true,
    });
    expect(integrity.integrityStatus).not.toBe("PASS");
  });

  it("8–9. sitemap X@V survives as exact upstream for page-structure semantic projection", () => {
    const exactId = "cdfart_mu6mirm8_5_web-tech-sitemap";
    const exactVersion = 1;
    const resolved = resolveUpstreamArtifactContext({
      upstream: sitemapUpstream(),
    });
    expect(resolved.artifactId).toBe(exactId);
    expect(resolved.artifactVersion).toBe(exactVersion);
    expect(resolved.semanticProjection.status).toBe("resolved");
    expect(resolved.semanticProjection.source).toBe("structured_payload");
  });

  it("10. structured upstream semantic fields preserved after projection", () => {
    const resolved = resolveUpstreamArtifactContext({
      upstream: sitemapUpstream(),
    });
    expect(resolved.semanticProjection.status).toBe("resolved");
    expect(resolved.structuredData.title).toBe("Recommended sitemap");
    expect(resolved.mediaReference.present).toBe(false);
  });

  it("11. governance does not BLOCK solely because media artifact is absent", () => {
    const governanceFinalize = createGovernanceFinalizeService();
    const extras = finalizeExecutionGovernanceExtras({
      organizationId: "org_t",
      executionId: "exec_gov_11",
      objective: "sitemap",
      productMode: "ai",
      capabilityId: "text.generate",
      service: "website",
      subtype: "landing-page",
      outputKind: "document",
      preview: JSON.stringify(STRUCTURED_SITEMAP),
      structuredData: STRUCTURED_SITEMAP,
      mediaArtifactIds: [],
      skipOutputRequirements: true,
      generationModality: "structured",
      providerSuccess: true,
      governanceFinalize,
      nowIso: () => "2026-09-18T00:00:00.000Z",
      createId: (p) => `${p}_t`,
    });
    expect(extras.governance.blocking).toBe(false);
    expect(String(extras.governance.action)).not.toBe("BLOCK");
  });

  it("trace summary uses NOT_APPLICABLE not MISSING for structured zero-media", () => {
    beginExecutionTrace({
      requestId: "req_trace",
      executionId: "exec_trace_na",
      correlationId: "corr_trace",
      service: "website",
      subtype: "landing-page",
      outputKind: "document",
    });
    const finalized = recordProductionEvidenceTrace({
      executionId: "exec_trace_na",
      contractValidationStatus: "PASS",
      evaluationStatus: "PASS",
      finalOutcome: "MODEL_SUCCESS",
      providerSuccess: true,
      step2Executed: true,
      evidenceRecorded: true,
      performanceRecordId: "perf_1",
      stageTrace: {
        artifactHydration: "NOT_APPLICABLE",
        artifactHydrationReason: "media_artifact_not_applicable_structured_phase",
        artifactRender: "NOT_APPLICABLE",
        artifactRenderReason: "media_artifact_not_applicable_structured_phase",
        runtimeEvaluation: "NOT_APPLICABLE",
        runtimeEvaluationReason: "media_artifact_not_applicable_structured_phase",
        evaluationPlane: "COMPLETED",
        evaluationPlaneReason: "structured_contract_validated_at_canonical_ingest",
        hydratedArtifactCount: 0,
      },
    });
    expect(finalized).toBeDefined();
    const withStructured = {
      ...finalized!,
      usedStructuredOutput: true,
    };
    const summary = buildExecutionTraceSummary(withStructured);
    expect(summary).toContain("artifact=NOT_APPLICABLE");
    expect(summary).toContain("artifact_render=NOT_APPLICABLE");
    expect(summary).not.toContain("artifact=MISSING");
    expect(summary).not.toContain("no_media_artifact_ids");
  });

  it("13–14. no service-specific or phase-ID runtime branches in media requirement helper", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/execution-authority.ts",
      ),
      "utf8",
    );
    const start = src.indexOf("export function cdfExecutionRequiresMediaArtifact");
    const end = src.indexOf("export function kindsConflict");
    const fn = src.slice(start, end);
    expect(fn).not.toMatch(/web-tech|sitemap|page-structure|openai|gpt-/i);
    expect(fn).toMatch(/generationModality|structured|image|video/);
  });
});
