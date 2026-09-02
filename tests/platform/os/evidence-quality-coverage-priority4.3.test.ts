/**
 * Priority 4.3 — Evidence quality & coverage control (deterministic fixtures, no paid APIs).
 */

import {
  buildModelPerformanceRecord,
  buildEvidenceReadinessReport,
  assessEvidenceReadinessSlice,
  buildEvidenceScopeKey,
  groupRecordsByEvidenceScope,
  DEFAULT_EVIDENCE_READINESS_THRESHOLDS,
  getBenchmarkCase,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { EVALUATION_PLANE_VERSION } from "../../../src/platform/os/evaluation/evaluation-plane/evaluation-plane-version";
import {
  filterObservationalProductionRecords,
  filterValidComparisonRecords,
} from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";

const modelA: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

const modelB: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.anthropic",
  modelId: "anthropic/claude-sonnet-4-5",
  capabilityId: "text.generate",
});

function controlledRecord(input: {
  readonly id: string;
  readonly model?: BenchmarkModelTarget;
  readonly qualityScore?: number;
  readonly recordedAt?: string;
  readonly strategyVersion?: string;
  readonly evaluationPlaneVersion?: string;
  readonly artifactEvaluatorVersion?: string;
  readonly clearEvaluatorProvenance?: boolean;
  readonly measuredDimensions?: readonly string[];
  readonly unmeasuredDimensions?: readonly string[];
  readonly benchmarkOutcome?: ModelPerformanceRecord["benchmarkOutcome"];
  readonly validForModelComparison?: boolean;
  readonly executionId?: string;
  readonly industry?: string;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const validation = validateOutputContract({
    organizationId: "org_p43",
    executionId: `exec_${input.id}`,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional social copywriting content for priority 4.3 evidence readiness testing.",
    briefObjective: bc.inputBrief,
  })!;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: {
      ...validation,
      overallScore: input.qualityScore ?? 72,
    },
    model: input.model ?? modelA,
    strategy: Object.freeze({
      strategyId: "strategy.baseline",
      version: input.strategyVersion ?? "1.0.0",
    }),
    executionId: input.executionId ?? `exec_${input.id}`,
    organizationId: "org_p43",
    executionOutput: {
      preview: "Professional social copywriting content for priority 4.3 evidence readiness testing.",
      latencyMs: 800,
    },
    knowledgeId: "knowledge.generic",
    knowledgeVersion: "knowledge.generic@1.0.0",
    createId: (p) => `${p}_${input.id}`,
    nowIso: () => input.recordedAt ?? "2026-06-01T00:00:00.000Z",
  });

  return Object.freeze({
    ...record,
    industry: input.industry ?? bc.industry,
    qualityScore: input.qualityScore ?? 72,
    benchmarkOutcome: input.benchmarkOutcome ?? "MODEL_SUCCESS",
    validForModelComparison: input.validForModelComparison ?? true,
    evaluationPlaneVersion: input.clearEvaluatorProvenance
      ? input.evaluationPlaneVersion
      : input.evaluationPlaneVersion ?? EVALUATION_PLANE_VERSION,
    evaluationPlaneId: input.clearEvaluatorProvenance ? undefined : record.evaluationPlaneId,
    artifactEvaluatorId: input.clearEvaluatorProvenance ? undefined : record.artifactEvaluatorId,
    artifactEvaluatorVersion: input.clearEvaluatorProvenance
      ? input.artifactEvaluatorVersion
      : input.artifactEvaluatorVersion ?? record.artifactEvaluatorVersion,
    measuredQualityDimensions: input.measuredDimensions ?? Object.freeze(["quality.content", "quality.ux"]),
    unmeasuredQualityDimensions: input.unmeasuredDimensions ?? Object.freeze([]),
    recordedAt: input.recordedAt ?? "2026-06-01T00:00:00.000Z",
  });
}

function productionRecord(id: string): ModelPerformanceRecord {
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const r = controlledRecord({ id: `prod_${id}`, model: modelA });
  return Object.freeze({
    ...r,
    performanceRecordId: `perf_prod_${id}`,
    evidenceSource: "production" as const,
    evidenceMode: "observational" as const,
    validForModelComparison: false,
    benchmarkOutcome: "MODEL_SUCCESS" as const,
    service: bc.service,
    subtype: bc.subtype,
    industry: bc.industry,
  });
}

function sufficientControlledSet(): ModelPerformanceRecord[] {
  const records: ModelPerformanceRecord[] = [];
  let n = 0;
  for (const model of [modelA, modelB]) {
    for (let rep = 0; rep < 3; rep += 1) {
      for (let i = 0; i < 2; i += 1) {
        n += 1;
        records.push(
          controlledRecord({
            id: `suf_${n}`,
            model,
            executionId: `exec_${model.modelId}_rep${rep}`,
            qualityScore: model.modelId.includes("gpt") ? 75 + i : 70 + i,
          }),
        );
      }
    }
  }
  return records;
}

describe("Priority 4.3 — Evidence quality & coverage control", () => {
  const NOW = "2026-06-15T00:00:00.000Z";

  it("reports SUFFICIENT for adequate controlled multi-model evidence", () => {
    const report = buildEvidenceReadinessReport({
      records: sufficientControlledSet(),
      nowIso: () => NOW,
    });
    const slice = report.slices[0];
    expect(slice?.readiness).toBe("SUFFICIENT");
    expect(slice?.comparableCandidateCount).toBeGreaterThanOrEqual(2);
    expect(report.adaptiveRoutingActivated).toBe(false);
    expect(report.productionRecordCountExcluded).toBe(0);
  });

  it("reports INSUFFICIENT for too few controlled samples", () => {
    const report = buildEvidenceReadinessReport({
      records: [
        controlledRecord({ id: "few_1", model: modelA }),
        controlledRecord({ id: "few_2", model: modelB }),
      ],
      nowIso: () => NOW,
    });
    expect(report.overallReadiness).toBe("INSUFFICIENT");
    expect(report.slices[0]?.blockers.some((b) => b.code === "TOO_FEW_CONTROLLED_SAMPLES")).toBe(
      true,
    );
  });

  it("reports insufficient repeats when repeat coverage is low", () => {
    const report = buildEvidenceReadinessReport({
      records: [
        controlledRecord({ id: "r1", model: modelA, executionId: "exec_a1" }),
        controlledRecord({ id: "r2", model: modelB, executionId: "exec_b1" }),
        controlledRecord({ id: "r3", model: modelA, executionId: "exec_a1" }),
        controlledRecord({ id: "r4", model: modelB, executionId: "exec_b1" }),
        controlledRecord({ id: "r5", model: modelA, executionId: "exec_a1" }),
        controlledRecord({ id: "r6", model: modelB, executionId: "exec_b1" }),
      ],
      nowIso: () => NOW,
    });
    expect(report.slices[0]?.blockers.some((b) => b.code === "INSUFFICIENT_REPEATS")).toBe(true);
  });

  it("reports SINGLE_MODEL_ONLY when only one model has valid comparison evidence", () => {
    const report = buildEvidenceReadinessReport({
      records: [
        ...Array.from({ length: 6 }, (_, i) =>
          controlledRecord({ id: `solo_${i}`, model: modelA, executionId: `exec_solo_${i % 2}` }),
        ),
      ],
      nowIso: () => NOW,
    });
    expect(report.slices[0]?.blockers.some((b) => b.code === "SINGLE_MODEL_ONLY")).toBe(true);
  });

  it("excludes production-only evidence from controlled comparison readiness", () => {
    const report = buildEvidenceReadinessReport({
      records: [productionRecord("1"), productionRecord("2")],
      nowIso: () => NOW,
    });
    expect(filterObservationalProductionRecords(report.slices.flatMap(() => []))).toEqual([]);
    expect(report.productionRecordCountExcluded).toBe(2);
    expect(report.controlledRecordCount).toBe(0);
    expect(report.slices[0]?.blockers.some((b) => b.code === "PRODUCTION_ONLY_EVIDENCE")).toBe(
      true,
    );
    expect(report.overallReadiness).toBe("INSUFFICIENT");
  });

  it("does not let production observations increase controlled comparison confidence", () => {
    const controlled = sufficientControlledSet();
    const mixed = [...controlled, productionRecord("mix")];
    const report = buildEvidenceReadinessReport({ records: mixed, nowIso: () => NOW });
    expect(report.productionRecordCountExcluded).toBe(1);
    expect(filterValidComparisonRecords(mixed).length).toBe(controlled.length);
    const slice = report.slices[0];
    expect(slice?.validComparisonSampleCount).toBe(controlled.length);
  });

  it("classifies STALE evidence using freshness thresholds", () => {
    const stale = sufficientControlledSet().map((r, i) =>
      controlledRecord({
        id: `stale_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: r.executionId,
        recordedAt: "2025-01-01T00:00:00.000Z",
      }),
    );
    const report = buildEvidenceReadinessReport({
      records: stale,
      nowIso: () => NOW,
    });
    expect(report.slices[0]?.freshnessStatus).toBe("STALE");
    expect(report.slices[0]?.blockers.some((b) => b.code === "STALE_EVIDENCE")).toBe(true);
  });

  it("classifies INCOMPARABLE when strategy versions differ", () => {
    const records = [
      ...Array.from({ length: 3 }, (_, i) =>
        controlledRecord({
          id: `inc_a_${i}`,
          model: modelA,
          strategyVersion: "1.0.0",
          executionId: `exec_ia_${i % 2}`,
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        controlledRecord({
          id: `inc_b_${i}`,
          model: modelB,
          strategyVersion: "2.0.0",
          executionId: `exec_ib_${i % 2}`,
        }),
      ),
    ];
    const report = buildEvidenceReadinessReport({ records, nowIso: () => NOW });
    expect(report.slices[0]?.readiness).toBe("INCOMPARABLE");
    expect(
      report.slices[0]?.blockers.some((b) => b.code === "INCOMPARABLE_CONFIGURATION"),
    ).toBe(true);
  });

  it("flags incomplete Evaluation Plane provenance", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      controlledRecord({
        id: `no_plane_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: `exec_np_${i % 2}`,
        clearEvaluatorProvenance: true,
        evaluationPlaneVersion: undefined,
        artifactEvaluatorVersion: undefined,
        measuredDimensions: Object.freeze([]),
        unmeasuredDimensions: Object.freeze(["quality.content"]),
      }),
    );
    const slice = assessEvidenceReadinessSlice({
      scopeRecords: records,
      nowMs: Date.parse(NOW),
    });
    expect(slice.blockers.some((b) => b.code === "EVALUATION_INCOMPLETE")).toBe(true);
    expect(slice.blockers.some((b) => b.code === "HEURISTIC_ONLY_EVALUATION")).toBe(true);
  });

  it("flags heuristic-only evidence separately from measured", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      controlledRecord({
        id: `heur_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: `exec_h_${i % 2}`,
        measuredDimensions: Object.freeze([]),
        unmeasuredDimensions: Object.freeze(["quality.visual_quality"]),
      }),
    );
    const slice = assessEvidenceReadinessSlice({
      scopeRecords: records,
      nowMs: Date.parse(NOW),
    });
    expect(slice.evaluationCoverage.heuristicOnlyRecords).toBeGreaterThan(0);
    expect(slice.evaluationCoverage.measuredDimensionCount).toBe(0);
    expect(slice.blockers.some((b) => b.code === "HEURISTIC_ONLY_EVALUATION")).toBe(true);
  });

  it("flags model-judged-only evidence", () => {
    const base = controlledRecord({
      id: "mj_1",
      measuredDimensions: Object.freeze([]),
      unmeasuredDimensions: Object.freeze([]),
    });
    const record = Object.freeze({
      ...base,
      provenance: Object.freeze([
        ...(base.provenance ?? []),
        { field: "independent.visual_quality", value: "MODEL_JUDGED" },
      ]),
    });
    const slice = assessEvidenceReadinessSlice({
      scopeRecords: [record],
      nowMs: Date.parse(NOW),
    });
    expect(slice.blockers.some((b) => b.code === "MODEL_JUDGED_ONLY")).toBe(true);
  });

  it("flags evaluation failure without collapsing to model quality inference", () => {
    const record = controlledRecord({
      id: "fail_1",
      benchmarkOutcome: "CONTRACT_FAILURE",
      validForModelComparison: false,
    });
    const slice = assessEvidenceReadinessSlice({
      scopeRecords: [record],
      nowMs: Date.parse(NOW),
    });
    expect(slice.readiness).toBe("BLOCKED");
    expect(slice.blockers.some((b) => b.code === "EVALUATION_FAILURE")).toBe(true);
  });

  it("reports BLOCKED for governance-restricted scope", () => {
    const records = sufficientControlledSet();
    const scopeKey = buildEvidenceScopeKey(records[0]!);
    const report = buildEvidenceReadinessReport({
      records,
      governanceBlockedScopeKeys: [scopeKey],
      nowIso: () => NOW,
    });
    expect(report.slices[0]?.readiness).toBe("BLOCKED");
    expect(report.slices[0]?.blockers.some((b) => b.code === "GOVERNANCE_BLOCKED")).toBe(true);
  });

  it("detects provenance mismatch across evaluation plane versions", () => {
    const records = [
      ...Array.from({ length: 3 }, (_, i) =>
        controlledRecord({
          id: `pv_a_${i}`,
          model: modelA,
          evaluationPlaneVersion: "p4.2.1",
          executionId: `exec_pva_${i % 2}`,
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        controlledRecord({
          id: `pv_b_${i}`,
          model: modelB,
          evaluationPlaneVersion: "p4.1.1",
          executionId: `exec_pvb_${i % 2}`,
        }),
      ),
    ];
    const report = buildEvidenceReadinessReport({ records, nowIso: () => NOW });
    expect(report.slices[0]?.blockers.some((b) => b.code === "PROVENANCE_MISMATCH")).toBe(
      true,
    );
  });

  it("isolates evidence between service/industry/modality/complexity slices", () => {
    const base = sufficientControlledSet();
    const otherIndustry = base.map((r, i) =>
      Object.freeze({ ...r, performanceRecordId: `perf_other_${i}`, industry: "healthcare" }),
    );
    const report = buildEvidenceReadinessReport({
      records: [...base, ...otherIndustry],
      nowIso: () => NOW,
    });
    expect(report.slices.length).toBe(2);
    const keys = report.slices.map((s) => s.scope.scopeKey);
    expect(new Set(keys).size).toBe(2);
    const groups = groupRecordsByEvidenceScope([...base, ...otherIndustry]);
    expect(groups.size).toBe(2);
  });

  it("produces deterministic results on repeated calculation", () => {
    const records = sufficientControlledSet();
    const a = buildEvidenceReadinessReport({ records, nowIso: () => NOW });
    const b = buildEvidenceReadinessReport({ records, nowIso: () => NOW });
    expect(a.overallReadiness).toBe(b.overallReadiness);
    expect(a.slices[0]?.readiness).toBe(b.slices[0]?.readiness);
    expect(a.slices[0]?.validComparisonSampleCount).toBe(
      b.slices[0]?.validComparisonSampleCount,
    );
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    const report = buildEvidenceReadinessReport({
      records: sufficientControlledSet(),
      nowIso: () => NOW,
    });
    expect(report.adaptiveRoutingActivated).toBe(false);
    expect(report.slices.every((s) => s.adaptiveRoutingEligible === false)).toBe(true);
  });

  it("documents freshness thresholds in config", () => {
    expect(DEFAULT_EVIDENCE_READINESS_THRESHOLDS.freshness.staleAfterDays).toBe(90);
    expect(DEFAULT_EVIDENCE_READINESS_THRESHOLDS.freshness.agingAfterDays).toBe(30);
    expect(DEFAULT_EVIDENCE_READINESS_THRESHOLDS.minRepeatsPerBenchmarkCell).toBe(2);
  });
});
