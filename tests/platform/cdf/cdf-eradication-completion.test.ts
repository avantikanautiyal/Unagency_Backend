/**
 * Architectural eradication regressions — prove old parallel paths cannot execute.
 */

import {
  applyCdfTransition,
  bindGeneratedArtifactToSession,
  createArtifact,
  fixturePackagingDieline,
  fixtureSocialMediaRoutes,
  getCdfSession,
  markValidated,
  PACKAGING_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  tryApplyCanonicalGenerationContext,
} from "../../../src/platform/cdf";
import {
  applyCdfCanonicalCompletionIngest,
  metadataRequiresCanonicalProductCompletion,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import { CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER } from "../../../src/platform/ai/canonical-model-request/types";
import * as fs from "node:fs";
import * as path from "node:path";

describe("CDF eradication — authoritative completion / candidates", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("A/B — canonical metadata without attach blocks product completion", async () => {
    expect(
      metadataRequiresCanonicalProductCompletion({
        cdfSessionId: "cdf_x",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
        cdfServiceId: "social-media",
      }),
    ).toBe(true);

    const out = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: {
        cdfSessionId: "cdf_missing",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
        cdfServiceId: "social-media",
      },
      structuredCandidate: null,
      mediaArtifactIds: [],
      executionId: "exec_erad_1",
      organizationId: "org_erad",
      logOsExecutionEvent: () => undefined,
    });
    expect(out.productCompletionBlocked).toBe(true);
    expect(out.socialMediaCanonicalAttach).toBeNull();
  });

  it("L — Packaging and Social Media use the same generic CAS bind", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_erad",
      projectId: "proj_erad",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Pack",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const session = briefed.value.session;
    const art = createArtifact({
      organizationId: "org_erad",
      projectId: "proj_erad",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    markValidated(art.artifact.artifactId, 1);
    const bound = bindGeneratedArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "dieline",
      artifactId: art.artifact.artifactId,
      version: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      organizationId: "org_erad",
      projectId: "proj_erad",
    });
    expect(bound.ok).toBe(true);
    if (bound.ok) {
      expect(bound.session.generatedArtifacts?.[0]?.artifactId).toBe(
        art.artifact.artifactId,
      );
      expect(bound.session.sessionVersion).toBeGreaterThan(session.sessionVersion);
    }
  });

  it("M — Presentation-shaped bind uses generic CAS generatedArtifacts", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_erad",
      projectId: "proj_erad",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "SM",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const session = briefed.value.session;
    const routes = createArtifact({
      organizationId: "org_erad",
      projectId: "proj_erad",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markValidated(routes.artifact.artifactId, 1);
    const bound = bindGeneratedArtifactToSession({
      sessionId: session.sessionId,
      phaseId: "routes",
      artifactId: routes.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      organizationId: "org_erad",
      projectId: "proj_erad",
    });
    expect(bound.ok).toBe(true);
    const live = getCdfSession(session.sessionId);
    expect(live?.generatedArtifacts?.[0]?.version).toBe(1);
  });

  it("K — canonical CDF phase cannot silently fall back to legacy context", () => {
    process.env.CDF_CANONICAL_GENERATION_CONTEXT = "0";
    const result = tryApplyCanonicalGenerationContext({
      prompt: "Generate routes",
      metadata: {
        cdfSessionId: "cdf_x",
        cdfPhaseId: "routes",
        cdfServiceId: "social-media",
        cdfExecutionStrategy: "canonical",
      },
      organizationId: "org_erad",
      projectId: "proj_erad",
    });
    delete process.env.CDF_CANONICAL_GENERATION_CONTEXT;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Contract forces context on; missing session must fail closed (never silent legacy).
      expect(result.message).toMatch(
        /silent legacy fallback removed|required|session not found|CONTEXT_RESOLUTION_FAILED/i,
      );
    }
  });

  it("H — CMR placeholder never projects as candidate / UI content", () => {
    const placeholder = CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER;
    expect(placeholder).toBe("[unagency:canonical_model_request]");
    expect(placeholder).not.toMatch(/Route \d/);
    // Architectural: placeholder is transport-only — never used as candidate factory,
    // route title, or selectable content in ingest/projection modules.
    const candidateProjectionSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/ai/canonical-model-request/types.ts",
      ),
      "utf8",
    );
    expect(candidateProjectionSrc).not.toMatch(/createCandidate|Route 1|selectable/);
    const applySrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-context/apply.ts",
      ),
      "utf8",
    );
    // Placeholder is assigned only to prompt transport, not to candidate arrays.
    expect(applySrc).toMatch(/prompt:\s*CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER/);
    expect(applySrc).not.toMatch(
      /candidates?.*=.*CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER/,
    );
  });

  it("I — registry has no legacyGenerator field controlling execution", () => {
    const registry = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Unagency-frontend/packages/api/src/domain/cdf/registry.ts",
      ),
      "utf8",
    );
    expect(registry).not.toMatch(/legacyGenerator\s*:/);
    const types = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Unagency-frontend/packages/api/src/domain/cdf/types.ts",
      ),
      "utf8",
    );
    expect(types).not.toMatch(/legacyGenerator:\s*CdfLegacyGeneratorKind/);
  });

  it("J — generationModality alone cannot select route_visual (contract declares strategy)", () => {
    const {
      resolveCdfPhaseExecutionContract,
    } = require("../../../src/platform/cdf/canonical") as typeof import("../../../src/platform/cdf/canonical");
    const smOutput = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(smOutput?.generationModality).toBe("image");
    expect(smOutput?.executionStrategy).toBe("canonical");
    expect(smOutput?.allowsRouteVisualFanout).toBe(false);

    // Logo options intentionally declares model-generation fanout — modality alone
    // never selected route_visual; strategy is declared on the phase contract.
    const optionsContract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-options",
    });
    expect(optionsContract?.executionStrategy).toBe("canonical");
    expect(optionsContract?.allowsModelGenerationFanout).toBe(true);
    expect(optionsContract?.allowsRouteVisualFanout).toBe(false);

    const systemContract = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-system",
    });
    expect(systemContract?.allowsModelGenerationFanout).toBe(false);
  });

  it("N — sync dispatch no longer contains duplicate tryIngestSocialMedia body", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-create-dispatch.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/applyCdfCanonicalCompletionIngest/);
    // Duplicate inline social ingest loop removed
    expect(src).not.toMatch(
      /tryIngestSocialMediaCdfCompletion\(\{\s*\n\s*metadata: workingMetadata/,
    );
  });

  it("O — packaging session-bind delegates to generic CAS (no saveCdfSession)", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/packaging-runtime/session-bind.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/bindGeneratedArtifactToSession/);
    expect(src).not.toMatch(/saveCdfSession/);
  });
});
