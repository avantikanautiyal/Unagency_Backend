/**
 * Step 14A.1 — Production evaluation alignment (deterministic, zero paid API calls).
 */

import {
  ingestProductionEvidenceAndShadow,
  resolveProductionValidationAsync,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryShadowDecisionStore,
  createBenchmarkAsyncMediaPlatform,
  materializeBenchmarkOsArtifacts,
  buildBenchmarkOsMetadata,
  DEFAULT_BENCHMARK_STRATEGY,
  getBenchmarkCase,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import {
  filterObservationalProductionRecords,
  filterControlledComparisonRecords,
} from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../../../src/platform/os/evaluation/evaluation-plane/evaluation-plane-version";
import {
  ARTIFACT_EVALUATOR_ID,
  ARTIFACT_EVALUATION_VERSION,
} from "../../../src/platform/os/evaluation/artifact-evaluation/artifact-evaluation-version";

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

const WEBSITE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Launch Landing Page</title>
  <meta name="description" content="Professional landing page for product launch campaign." />
</head>
<body>
  <main><h1>Launch</h1><p>Professional landing page content for product launch campaign.</p></main>
</body>
</html>`;

describe("Step 14A.1 — Production evaluation alignment", () => {
  beforeEach(() => {
    clearValidationCache();
  });

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("hydrates persisted artifacts and runs Evaluation Plane before Step 2", async () => {
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const metadata = buildBenchmarkOsMetadata({
      benchmarkCase: bc,
      model: textModel,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      organizationId: "org_14a1",
      executionId: "exec_prod_align",
    });
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_prod_align",
      organizationId: "org_14a1",
      metadata,
      runtimeOutput: {
        structured: {
          routes: [
            {
              title: "Launch",
              summary: "Professional landing page for product launch campaign.",
              stack: "html-static",
              files: [{ path: "index.html", content: WEBSITE_HTML }],
            },
          ],
        },
        content: WEBSITE_HTML,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_14a1`,
    });

    expect(materialized.mediaArtifactIds.length).toBeGreaterThan(0);

    const resolved = await resolveProductionValidationAsync({
      context: Object.freeze({
        organizationId: "org_14a1",
        productionExecutionId: "exec_prod_align",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: materialized.preview,
        structuredData: materialized.structuredData,
        mediaArtifactIds: materialized.mediaArtifactIds,
        providerSuccess: true,
        latencyMs: 100,
        createId: (p) => `${p}_14a1`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      artifactEvaluationDeps: {
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
      },
    });

    expect(resolved.stageTrace.artifactHydration).toBe("COMPLETED");
    expect(resolved.stageTrace.evaluationPlane).toBe("COMPLETED");
    expect(resolved.stageTrace.hydratedArtifactCount).toBeGreaterThan(0);
    expect(resolved.validation).toBeTruthy();
    expect(
      resolved.validation!.provenance.some((p) => p.field === "evaluationPlaneId"),
    ).toBe(true);
    expect(
      resolved.validation!.provenance.some((p) => p.field === "artifactEvaluatorId"),
    ).toBe(true);
  });

  it("records production evidence with evaluation plane provenance on ModelPerformanceRecord", async () => {
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_prod_rec",
      organizationId: "org_14a1_rec",
      metadata: buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_14a1_rec",
        executionId: "exec_prod_rec",
      }),
      runtimeOutput: {
        structured: {
          routes: [
            {
              title: "Launch",
              summary: "Professional landing page for product launch campaign.",
              stack: "html-static",
              files: [{ path: "index.html", content: WEBSITE_HTML }],
            },
          ],
        },
        content: WEBSITE_HTML,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_rec`,
    });

    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const shadowStore = new InMemoryShadowDecisionStore();
    const result = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_14a1_rec",
        productionExecutionId: "exec_prod_rec",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: materialized.preview,
        structuredData: materialized.structuredData,
        mediaArtifactIds: materialized.mediaArtifactIds,
        providerSuccess: true,
        latencyMs: 120,
        createId: (p) => `${p}_rec`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      {
        recordStore,
        shadowStore,
        artifactEvaluationDeps: {
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
        },
      },
    );

    expect(result.evidenceRecorded).toBe(true);
    const record = result.performanceRecord!;
    expect(record.evidenceSource).toBe("production");
    expect(record.evidenceMode).toBe("observational");
    expect(record.validForModelComparison).toBe(false);
    expect(record.evaluationPlaneId).toBe(EVALUATION_PLANE_ID);
    expect(record.evaluationPlaneVersion).toBe(EVALUATION_PLANE_VERSION);
    expect(record.artifactEvaluatorId).toBe(ARTIFACT_EVALUATOR_ID);
    expect(record.artifactEvaluatorVersion).toBe(ARTIFACT_EVALUATION_VERSION);
    expect(record.measuredQualityDimensions.length).toBeGreaterThan(0);
    expect(record.provenance.some((p) => p.field === "mediaArtifactIds")).toBe(true);
  });

  it("honestly skips hydration when no artifacts are available", async () => {
    const resolved = await resolveProductionValidationAsync({
      context: Object.freeze({
        organizationId: "org_no_art",
        productionExecutionId: "exec_no_art",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        preview: "Short preview only.",
        providerSuccess: true,
        latencyMs: 50,
        createId: (p) => `${p}_noart`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(resolved.stageTrace.artifactHydration).toBe("SKIPPED");
    expect(resolved.stageTrace.evaluationPlane).toBe("SKIPPED");
    expect(resolved.stageTrace.artifactHydrationReason).toBe("no_media_artifact_ids");
    expect(resolved.validation).toBeTruthy();
  });

  it("honestly reports missing artifact evaluation deps when artifacts exist", async () => {
    const resolved = await resolveProductionValidationAsync({
      context: Object.freeze({
        organizationId: "org_no_deps",
        productionExecutionId: "exec_no_deps",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        preview: "Preview",
        mediaArtifactIds: ["art_missing_deps"],
        providerSuccess: true,
        latencyMs: 50,
        createId: (p) => `${p}_nodeps`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(resolved.stageTrace.artifactHydration).toBe("SKIPPED");
    expect(resolved.stageTrace.evaluationPlane).toBe("SKIPPED");
    expect(resolved.stageTrace.artifactHydrationReason).toBe(
      "artifact_evaluation_deps_unavailable",
    );
  });

  it("does not convert evaluator failure into automatic MODEL_QUALITY_FAILURE", async () => {
    const resolved = await resolveProductionValidationAsync({
      context: Object.freeze({
        organizationId: "org_eval_fail",
        productionExecutionId: "exec_eval_fail",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        preview: "Preview",
        mediaArtifactIds: ["art_does_not_exist"],
        providerSuccess: true,
        latencyMs: 50,
        createId: (p) => `${p}_evalfail`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      artifactEvaluationDeps: createBenchmarkAsyncMediaPlatform(),
    });

    expect(resolved.stageTrace.evaluationPlane).toBe("FAILED");
    expect(resolved.stageTrace.artifactHydration).toBe("FAILED");
    expect(resolved.validation).toBeTruthy();

    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const ingested = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_eval_fail",
        productionExecutionId: "exec_eval_fail",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: "website",
        subtype: "landing-page",
        outputKind: "deferred_website",
        preview: "Preview",
        mediaArtifactIds: ["art_does_not_exist"],
        providerSuccess: true,
        latencyMs: 50,
        createId: (p) => `${p}_ingest`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      {
        recordStore,
        shadowStore: new InMemoryShadowDecisionStore(),
        artifactEvaluationDeps: createBenchmarkAsyncMediaPlatform(),
      },
    );
    expect(ingested.performanceRecord?.benchmarkOutcome).not.toBe("PROVIDER_OPERATIONAL_FAILURE");
  });

  it("keeps controlled benchmark evidence separate from observational production evidence", async () => {
    const recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    const bc = getBenchmarkCase("bench.social.copywriting")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_sep",
      organizationId: "org_sep",
      metadata: buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_sep",
        executionId: "exec_sep",
      }),
      runtimeOutput: { content: "Professional social copy for separation test." },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_sep`,
    });

    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_sep",
        productionExecutionId: "exec_sep_prod",
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        service: bc.service,
        subtype: bc.subtype,
        outputKind: bc.outputKind,
        preview: materialized.preview,
        mediaArtifactIds: materialized.mediaArtifactIds,
        providerSuccess: true,
        latencyMs: 80,
        createId: (p) => `${p}_sep`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      {
        recordStore,
        shadowStore: new InMemoryShadowDecisionStore(),
        artifactEvaluationDeps: {
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
        },
      },
    );

    const all = await recordStore.query({ organizationId: "org_sep", limit: 10 });
    const observational = filterObservationalProductionRecords(all);
    const controlled = filterControlledComparisonRecords(all);
    expect(observational.length).toBe(1);
    expect(controlled.length).toBe(0);
    expect(observational[0]!.evidenceMode).toBe("observational");
  });
});
