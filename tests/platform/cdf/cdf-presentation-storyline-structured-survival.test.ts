/**
 * Framework-wide structured-output preservation for CdfPresentationStoryline:
 * provider → job summary → export gate → candidate → canonical ingest.
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  fixturePresentationStoryline,
  getCdfSession,
  PRESENTATION_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  tryIngestPresentationCdfCompletion,
} from "../../../src/platform/cdf";
import { applyCdfCanonicalCompletionIngest } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  isCdfArtifactStructuredPayload,
  isDocumentExportProjection,
  resolveDocumentExportKind,
  shouldRunDocumentExportMaterialization,
} from "../../../src/platform/api/services/document-export-materializer";
import {
  mergeExportArtifactsIntoResult,
  buildExecutionResultPayload,
} from "../../../src/platform/api/services/execution-result-payload";
import {
  resolveStructuredCompletionCandidate,
} from "../../../src/platform/api/services/execution-structured-completion-candidate";
import { buildIntegrationJobSummary } from "../../../src/platform/infrastructure/execution/workers/integration-job-summary";
import type { DirectExecutionReport } from "../../../src/platform/direct/contracts";

const storylinePayload = fixturePresentationStoryline();

const presentationStorylineMetadata: Record<string, unknown> = {
  cdfSessionId: "cdf_storyline_surv",
  cdfPhaseId: "storyline",
  cdfServiceId: "presentation",
  cdfExecutionStrategy: "canonical",
  cdfArtifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
  cdfGenerationModality: "structured",
  structuredOutput: { name: "CdfPresentationStoryline", schema: {} },
};

function reportWithStructured(
  structured: unknown,
  metadata: Record<string, unknown>,
): DirectExecutionReport {
  return {
    resultId: "direct_test",
    requestId: "exec_storyline_surv",
    request: {
      requestId: "exec_storyline_surv",
      rawPrompt: "storyline",
      metadata,
    },
    artifacts: {
      runtime: {
        success: true,
        response: {
          requestId: "exec_storyline_surv_rt",
          providerId: "provider.anthropic",
          modelId: "claude-opus-4-1",
          output: {
            content: JSON.stringify(structured),
            structured,
          },
        },
        statistics: { totalMs: 10 },
        finalProviderId: "provider.anthropic",
        finalModelId: "claude-opus-4-1",
      },
      routing: {
        plan: {
          primary: {
            providerId: "provider.anthropic",
            modelId: "claude-opus-4-1",
          },
        },
      },
      task: {
        capabilityMap: { primary: "text.generate" },
        request: { rawPrompt: "storyline" },
      },
    },
    trace: {
      traceId: "tr",
      correlationId: "c",
      requestId: "exec_storyline_surv",
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

function seedPresentationSession(): string {
  const started = applyCdfTransition({
    action: "start",
    serviceId: "presentation",
    productMode: "ai",
    organizationId: "org_storyline_surv",
    projectId: "proj_storyline_surv",
  });
  if (!started.ok) throw new Error("start");
  return started.value.session.sessionId;
}

describe("CdfPresentationStoryline structured survival", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("preserves sections + slides + options + notes through buildIntegrationJobSummary", () => {
    const report = reportWithStructured(
      storylinePayload,
      presentationStorylineMetadata,
    );
    const summary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 10,
    });
    assert.equal(summary.success, true);
    const emission = summary.structuredEmissionData as Record<string, unknown>;
    assert.ok(emission);
    assert.equal(Array.isArray(emission.sections), true);
    assert.equal(Array.isArray(emission.slides), true);
    assert.equal((emission.slides as unknown[]).length, 3);
    assert.equal(typeof emission.notes, "string");

    const sd = summary.structuredData as Record<string, unknown>;
    assert.equal(Array.isArray(sd.slides), true);
    assert.equal((sd.slides as unknown[]).length, 3);
  });

  it("does not coerce Cdf artifact payload toward DocumentPlan", () => {
    assert.equal(isCdfArtifactStructuredPayload(storylinePayload), true);
    assert.equal(
      resolveDocumentExportKind({
        structuredName: "CdfPresentationStoryline",
        data: storylinePayload,
      }),
      null,
    );
    assert.equal(
      shouldRunDocumentExportMaterialization({
        metadata: presentationStorylineMetadata,
        structuredData: storylinePayload,
      }),
      false,
    );
  });

  it("candidate prefers structuredEmissionData over export projection on job summary", () => {
    const exportProjection = {
      title: "Lost",
      summary: "Document export projection",
      sections: [{ heading: "A", body: "B" }],
      exportKind: "document",
      pdfArtifactId: "art_pdf_1",
      docxArtifactId: "art_docx_1",
      downloadFormats: ["pdf", "docx"],
      producedDeliverableFormats: ["PDF", "DOCX"],
    };
    assert.equal(isDocumentExportProjection(exportProjection), true);

    const resolved = resolveStructuredCompletionCandidate({
      result: { kind: "structured", data: exportProjection },
      jobSummary: {
        structuredData: exportProjection,
        structuredEmissionData: storylinePayload,
        success: true,
      },
      runtimeOutput: {
        structured: storylinePayload,
      },
      metadata: presentationStorylineMetadata,
    });
    assert.equal(resolved.source, "job_summary.structuredEmissionData");
    assert.equal(
      Array.isArray((resolved.candidate as { slides: unknown[] }).slides),
      true,
    );
  });

  it("falls back to runtime.structured when job summary is export-only projection", () => {
    const exportProjection = {
      title: "Lost",
      summary: "Document export projection",
      sections: [{ heading: "A", body: "B" }],
      exportKind: "document",
      pdfArtifactId: "art_pdf_1",
    };
    const resolved = resolveStructuredCompletionCandidate({
      jobSummary: {
        structuredData: exportProjection,
        success: true,
      },
      runtimeOutput: {
        structured: storylinePayload,
      },
      metadata: presentationStorylineMetadata,
    });
    assert.equal(resolved.source, "runtime.structured");
    assert.equal((resolved.candidate as { slides: unknown[] }).slides.length, 3);
  });

  it("mergeExportArtifactsIntoResult keeps authoritative slides alongside export artifacts", () => {
    const exportPlan = {
      title: "Export title",
      summary: "Export summary",
      sections: [{ heading: "A", body: "B" }],
      pdfArtifactId: "art_pdf_1",
      docxArtifactId: "art_docx_1",
    };
    const merged = mergeExportArtifactsIntoResult({
      status: "succeeded",
      result: buildExecutionResultPayload({
        status: "succeeded",
        jobSummary: {
          structuredEmissionData: storylinePayload,
          structuredData: storylinePayload,
          documentExportPlan: exportPlan,
          documentExportKind: "document",
          success: true,
        },
      }),
      jobSummary: {
        structuredEmissionData: storylinePayload,
        structuredData: storylinePayload,
        documentExportPlan: exportPlan,
        documentExportKind: "document",
        success: true,
      },
      mediaArtifactIds: ["art_pdf_1", "art_docx_1"],
    });
    assert.equal(merged.kind, "structured");
    const data = merged.data as Record<string, unknown>;
    assert.equal(Array.isArray(data.slides), true);
    assert.equal((data.slides as unknown[]).length, 3);
    assert.equal(data.pdfArtifactId, "art_pdf_1");
  });

  it("distributed path simulation: job summary → candidate → presentation canonical ingest", async () => {
    const sessionId = seedPresentationSession();
    const metadata = {
      ...presentationStorylineMetadata,
      cdfSessionId: sessionId,
    };
    const report = reportWithStructured(storylinePayload, metadata);
    const jobSummary = buildIntegrationJobSummary({
      report,
      executionMode: "live",
      durationMs: 12,
    });
    const runtimeOutput = report.artifacts.runtime?.response?.output as Record<
      string,
      unknown
    >;
    const resolved = resolveStructuredCompletionCandidate({
      result: buildExecutionResultPayload({
        status: "succeeded",
        jobSummary,
        runtimeOutput,
      }),
      jobSummary,
      runtimeOutput,
      metadata,
    });
    assert.equal(resolved.source, "job_summary.structuredEmissionData");
    assert.equal(
      (resolved.candidate as { slides: unknown[] }).slides.length,
      3,
    );

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: metadata,
      structuredCandidate: resolved.candidate,
      mediaArtifactIds: [],
      executionId: "exec_storyline_surv",
      organizationId: "org_storyline_surv",
      projectId: "proj_storyline_surv",
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(ingest.productCompletionBlocked, false);
    assert.ok(ingest.presentationCanonicalAttach);
    assert.equal(
      ingest.presentationCanonicalAttach!.cdfArtifactKey,
      PRESENTATION_ARTIFACT_KEYS.storyline,
    );

    const session = getCdfSession(sessionId);
    assert.ok(session?.generatedArtifacts?.some(
      (r) => r.artifactKey === PRESENTATION_ARTIFACT_KEYS.storyline,
    ));
  });

  it("canonical ingest failure does not silently accept legacy export projection", () => {
    const sessionId = seedPresentationSession();
    const exportProjection = {
      title: "Legacy",
      summary: "Sections only",
      sections: [{ heading: "A", body: "B" }],
      exportKind: "document",
      pdfArtifactId: "art_pdf_1",
    };
    const ingest = tryIngestPresentationCdfCompletion({
      metadata: {
        ...presentationStorylineMetadata,
        cdfSessionId: sessionId,
      },
      rawOutput: exportProjection,
      executionId: "exec_legacy_block",
      organizationId: "org_storyline_surv",
      projectId: "proj_storyline_surv",
    });
    assert.ok(ingest);
    assert.notEqual(ingest!.kind, "accepted");
  });
});
