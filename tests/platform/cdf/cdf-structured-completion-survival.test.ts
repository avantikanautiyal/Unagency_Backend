/**
 * Structured completion candidate survival — provider normalize → job summary →
 * candidate → canonical ingest for CDF text_choice emission phases.
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaSizeReference,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  tryIngestSocialMediaCdfCompletion,
  bindSocialMediaGeneratedFromAttach,
} from "../../../src/platform/cdf";
import { applyCdfCanonicalCompletionIngest } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  resolveStructuredCompletionCandidate,
} from "../../../src/platform/api/services/execution-structured-completion-candidate";
import { buildExecutionResultPayload } from "../../../src/platform/api/services/execution-result-payload";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";
import { isCanonicalStructuredPhaseMetadata } from "../../../src/platform/cdf/structured-output-contract";

const routesPayload = {
  routes: [
    {
      name: "Everyday Energy",
      creativeIdea: "Bright splash",
      visualTreatment: "High-key",
      headlineAngle: "Energy that fits Tuesday",
      rationale: "Fits everyday energy brief",
    },
    {
      name: "Quiet Power",
      creativeIdea: "Soft gradient",
      visualTreatment: "Muted",
      headlineAngle: "Steady fuel",
      rationale: "Calm confidence",
    },
    {
      name: "Playful Burst",
      creativeIdea: "Fruit confetti",
      visualTreatment: "Max color",
      headlineAngle: "Sip the spark",
      rationale: "Youthful joy",
    },
  ],
};

function seedSocialRoutesSession(): {
  sessionId: string;
  metadata: Record<string, unknown>;
} {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "social-media",
    productMode: "ai",
    organizationId: "org_struct_surv",
    projectId: "proj_struct_surv",
  });
  if (!started.ok) throw new Error("start");
  let session = started.value.session;
  const briefed = applyCdfTransition({
    sessionId: session.sessionId,
    action: "submit_brief",
    brief: "Energy drink for busy parents",
    expectedVersion: session.sessionVersion,
  });
  if (!briefed.ok) throw new Error("brief");
  session = briefed.value.session;

  // Seed platform + size so routes ingest can proceed if deps require them.
  const platform = fixtureSocialMediaPlatform();
  const size = fixtureSocialMediaSizeReference();
  const platIngest = tryIngestSocialMediaCdfCompletion({
    metadata: {
      cdfSessionId: session.sessionId,
      cdfPhaseId: "platform",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
    },
    rawOutput: platform,
    executionId: "exec_plat",
    organizationId: "org_struct_surv",
    projectId: "proj_struct_surv",
    forceOptIn: true,
  });
  if (!platIngest || platIngest.kind !== "accepted") {
    throw new Error(`platform ingest: ${JSON.stringify(platIngest)}`);
  }
  const platBound = bindSocialMediaGeneratedFromAttach({
    sessionId: session.sessionId,
    phaseId: "platform",
    attach: platIngest.attach,
    organizationId: "org_struct_surv",
    projectId: "proj_struct_surv",
  });
  if (!platBound.ok) throw new Error(platBound.message);
  session = platBound.session;

  const sizeIngest = tryIngestSocialMediaCdfCompletion({
    metadata: {
      cdfSessionId: session.sessionId,
      cdfPhaseId: "size-reference",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
    },
    rawOutput: size,
    executionId: "exec_size",
    organizationId: "org_struct_surv",
    projectId: "proj_struct_surv",
    forceOptIn: true,
  });
  if (!sizeIngest || sizeIngest.kind !== "accepted") {
    throw new Error(`size ingest: ${JSON.stringify(sizeIngest)}`);
  }
  const sizeBound = bindSocialMediaGeneratedFromAttach({
    sessionId: session.sessionId,
    phaseId: "size-reference",
    attach: sizeIngest.attach,
    organizationId: "org_struct_surv",
    projectId: "proj_struct_surv",
  });
  if (!sizeBound.ok) throw new Error(sizeBound.message);

  // Advance to routes phase when needed via approve/select — many fixtures use
  // force ingest with phase stamps regardless of session phase cursor.
  return {
    sessionId: session.sessionId,
    metadata: {
      cdfSessionId: session.sessionId,
      cdfPhaseId: "routes",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
      cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      cdfGenerationModality: "text",
      structuredOutput: { name: "CdfSocialMediaRoutes", schema: {} },
    },
  };
}

function reportWithStructured(
  structured: unknown,
  metadata: Record<string, unknown>,
): DirectExecutionReport {
  return {
    resultId: "direct_test",
    requestId: "exec_struct_surv",
    request: {
      requestId: "exec_struct_surv",
      rawPrompt: "routes",
      metadata,
    },
    artifacts: {
      runtime: {
        success: true,
        response: {
          requestId: "exec_struct_surv_rt_r0",
          providerId: "provider.anthropic",
          modelId: "claude-sonnet-4-5",
          output: {
            content: JSON.stringify(structured),
            structured,
            text: "Here are three routes...",
          },
        },
        statistics: { totalMs: 10 },
        finalProviderId: "provider.anthropic",
        finalModelId: "claude-sonnet-4-5",
      },
      routing: {
        plan: {
          primary: {
            providerId: "provider.anthropic",
            modelId: "claude-sonnet-4-5",
          },
        },
      },
      task: {
        capabilityMap: { primary: "text.generate" },
        request: { rawPrompt: "routes" },
      },
    },
    trace: {
      traceId: "tr",
      correlationId: "c",
      requestId: "exec_struct_surv",
      stages: [],
      bridges: [],
      completedStages: ["provider_runtime"],
      capturedAt: new Date().toISOString(),
    },
    stagesCompleted: ["provider_runtime"],
    success: true,
    durationMs: 10,
    createdAt: new Date().toISOString(),
    version: "test",
  } as unknown as DirectExecutionReport;
}

describe("structured completion survival → canonical ArtifactVersion", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("1/2 — Anthropic-shaped structured survives job summary + Direct result keys", () => {
    const meta = {
      cdfSessionId: "cdf_x",
      cdfPhaseId: "routes",
      cdfServiceId: "social-media",
      cdfExecutionStrategy: "canonical",
      structuredOutput: { name: "CdfSocialMediaRoutes" },
    };
    const report = reportWithStructured(routesPayload, meta);
    const summary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 10,
    });
    assert.equal(summary.success, true);
    assert.ok(summary.structuredData);
    assert.deepEqual(
      (summary.structuredData as { routes: unknown[] }).routes.length,
      3,
    );
  });

  it("3/4/5 — structured survives result payload + candidate prefers jobSummary", () => {
    const summary = {
      structuredData: routesPayload,
      resultText: "prose should not win",
      success: true,
    };
    const result = buildExecutionResultPayload({
      status: "succeeded",
      jobSummary: summary,
    });
    assert.equal(result.kind, "structured");
    assert.equal(
      Array.isArray((result.data as { routes: unknown[] }).routes),
      true,
    );
    assert.equal(
      (result.data as { exportKind?: string }).exportKind,
      undefined,
    );

    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "ignore me" },
      jobSummary: summary,
      metadata: {
        cdfSessionId: "cdf_x",
        cdfPhaseId: "routes",
        cdfServiceId: "social-media",
        cdfExecutionStrategy: "canonical",
      },
    });
    assert.equal(resolved.source, "job_summary.structuredData");
    assert.equal(resolved.structuredPresent, true);
    assert.ok(
      Array.isArray((resolved.candidate as { routes: unknown[] }).routes),
    );
  });

  it("6/7/8 — text modality CdfSocialMediaRoutes creates ArtifactVersion + generated X@V", async () => {
    const { sessionId, metadata } = seedSocialRoutesSession();
    assert.equal(isCanonicalStructuredPhaseMetadata(metadata), true);

    const report = reportWithStructured(routesPayload, metadata);
    const jobSummary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 12,
    });
    const result = buildExecutionResultPayload({
      status: "succeeded",
      jobSummary,
    });
    const resolved = resolveStructuredCompletionCandidate({
      result,
      jobSummary,
      runtimeOutput: report.artifacts.runtime?.response?.output as Record<
        string,
        unknown
      >,
      metadata,
    });
    assert.equal(resolved.structuredPresent, true);

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: metadata,
      structuredCandidate: resolved.candidate,
      mediaArtifactIds: [],
      executionId: "exec_struct_surv_routes",
      organizationId: "org_struct_surv",
      projectId: "proj_struct_surv",
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(ingest.productCompletionBlocked, false);
    assert.ok(ingest.socialMediaCanonicalAttach);
    const attach = ingest.socialMediaCanonicalAttach!;
    assert.equal(attach.cdfArtifactKey, SOCIAL_MEDIA_ARTIFACT_KEYS.routes);
    assert.match(String(attach.cdfArtifactId), /^cdfart_/);
    assert.equal(typeof attach.cdfArtifactVersion, "number");

    const session = getCdfSession(sessionId);
    assert.ok(session);
    const pin = session!.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    assert.ok(pin);
    assert.equal(pin!.artifactId, attach.cdfArtifactId);
    assert.equal(pin!.version, attach.cdfArtifactVersion);
  });

  it("14 — provider success with missing structured fails closed for emission", async () => {
    const { metadata } = seedSocialRoutesSession();
    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "text", text: "# Three Creative Directions\n..." },
      jobSummary: { success: true, resultText: "# Three Creative Directions" },
      metadata,
    });
    assert.equal(resolved.source, "missing_structured_for_emission");
    assert.equal(resolved.candidate, null);

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: metadata,
      structuredCandidate: resolved.candidate,
      mediaArtifactIds: [],
      executionId: "exec_missing_struct",
      organizationId: "org_struct_surv",
      projectId: "proj_struct_surv",
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(ingest.productCompletionBlocked, true);
    assert.equal(ingest.socialMediaCanonicalAttach, null);
  });

  it("does not website-rewrite social routes in result payload", () => {
    const result = buildExecutionResultPayload({
      status: "succeeded",
      jobSummary: { structuredData: routesPayload, success: true },
    });
    assert.equal(result.kind, "structured");
    const data = result.data as Record<string, unknown>;
    assert.equal(data.exportKind, undefined);
    assert.equal(Array.isArray(data.routes), true);
    assert.equal(
      typeof (data.routes as { creativeIdea?: string }[])[0]?.creativeIdea,
      "string",
    );
  });
});
