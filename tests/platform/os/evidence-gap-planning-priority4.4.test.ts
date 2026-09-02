/**
 * Priority 4.4 — Evidence gap analysis & experiment planning (advisory only, no execution).
 */

import {
  buildModelPerformanceRecord,
  analyzeEvidenceGapsAndPlanExperiments,
  buildEvidenceScopeKey,
  getBenchmarkCase,
  TIER1_CONTROLLED_EVIDENCE_MODELS,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { EVALUATION_PLANE_VERSION } from "../../../src/platform/os/evaluation/evaluation-plane/evaluation-plane-version";

const modelA: BenchmarkModelTarget = TIER1_CONTROLLED_EVIDENCE_MODELS[0]!;
const modelB: BenchmarkModelTarget = TIER1_CONTROLLED_EVIDENCE_MODELS[1]!;

const NOW = "2026-06-15T00:00:00.000Z";

function controlledRecord(input: {
  readonly id: string;
  readonly model?: BenchmarkModelTarget;
  readonly qualityScore?: number;
  readonly recordedAt?: string;
  readonly strategyVersion?: string;
  readonly evaluationPlaneVersion?: string;
  readonly measuredDimensions?: readonly string[];
  readonly unmeasuredDimensions?: readonly string[];
  readonly benchmarkOutcome?: ModelPerformanceRecord["benchmarkOutcome"];
  readonly validForModelComparison?: boolean;
  readonly executionId?: string;
  readonly industry?: string;
  readonly clearEvaluatorProvenance?: boolean;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const validation = validateOutputContract({
    organizationId: "org_p44",
    executionId: `exec_${input.id}`,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional social copywriting content for priority 4.4 gap analysis testing.",
    briefObjective: bc.inputBrief,
  })!;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: { ...validation, overallScore: input.qualityScore ?? 72 },
    model: input.model ?? modelA,
    strategy: Object.freeze({
      strategyId: "strategy.baseline",
      version: input.strategyVersion ?? "1.0.0",
    }),
    executionId: input.executionId ?? `exec_${input.id}`,
    organizationId: "org_p44",
    executionOutput: {
      preview: "Professional social copywriting content for priority 4.4 gap analysis testing.",
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
  const r = controlledRecord({ id: `prod_${id}` });
  return Object.freeze({
    ...r,
    performanceRecordId: `perf_prod_${id}`,
    evidenceSource: "production" as const,
    evidenceMode: "observational" as const,
    validForModelComparison: false,
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
          }),
        );
      }
    }
  }
  return records;
}

describe("Priority 4.4 — Evidence gap analysis & experiment planning", () => {
  it("produces no experiment for SUFFICIENT scope", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: sufficientControlledSet(),
      nowIso: () => NOW,
    });
    expect(report.adaptiveRoutingActivated).toBe(false);
    expect(report.gaps.length).toBe(0);
    expect(report.recommendations.length).toBe(0);
    expect(report.observations.length).toBeGreaterThan(0);
    expect(report.observations[0]?.kind).toBe("OBSERVATION");
  });

  it("produces no gaps when no records exist", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [],
      nowIso: () => NOW,
    });
    expect(report.gaps.length).toBe(0);
    expect(report.recommendations.length).toBe(0);
  });

  it("recommends pilot when production-only evidence exists", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [productionRecord("1"), productionRecord("2")],
      nowIso: () => NOW,
    });
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0]?.reasonCodes).toContain("MISSING_CONTROLLED_EVIDENCE");
    const rec = report.recommendations[0]!;
    expect(rec.action).toBe("RUN_CONTROLLED_PILOT");
    expect(rec.strategy).toBe("targeted");
    expect(rec.executable).toBe(false);
    expect(rec.totalInvocations).toBeGreaterThan(0);
  });

  it("recommends ADD_COMPARISON_CANDIDATE for single-model-only scope", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: Array.from({ length: 6 }, (_, i) =>
        controlledRecord({
          id: `solo_${i}`,
          model: modelA,
          executionId: `exec_solo_${i % 2}`,
        }),
      ),
      nowIso: () => NOW,
    });
    const rec = report.recommendations[0]!;
    expect(rec.action).toBe("ADD_COMPARISON_CANDIDATE");
    expect(rec.candidates.length).toBe(1);
    expect(rec.candidates[0]?.modelId).toBe(modelB.modelId);
    expect(rec.strategy).toBe("targeted");
  });

  it("recommends ADD_REPEATS for insufficient repeat coverage", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
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
    expect(report.recommendations[0]?.action).toBe("ADD_REPEATS");
    expect(report.recommendations[0]?.repeats).toBeGreaterThan(0);
  });

  it("recommends RERUN_STALE_CELL for stale evidence", () => {
    const stale = sufficientControlledSet().map((r, i) =>
      controlledRecord({
        id: `stale_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: r.executionId,
        recordedAt: "2025-01-01T00:00:00.000Z",
      }),
    );
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: stale,
      nowIso: () => NOW,
    });
    expect(report.recommendations[0]?.action).toBe("RERUN_STALE_CELL");
    expect(report.recommendations[0]?.rationale.some((r) => r.includes("preserved"))).toBe(
      true,
    );
  });

  it("recommends RERUN_CANONICAL_CONFIGURATION for incomparable evidence", () => {
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
    const report = analyzeEvidenceGapsAndPlanExperiments({ records, nowIso: () => NOW });
    expect(report.recommendations[0]?.action).toBe("RERUN_CANONICAL_CONFIGURATION");
    expect(report.gaps[0]?.reasonCodes).toContain("INCOMPARABLE_CONFIGURATION");
  });

  it("recommends RERUN_EVALUATION_PLANE for incomplete evaluation", () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      controlledRecord({
        id: `eval_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: `exec_ev_${i % 2}`,
        clearEvaluatorProvenance: true,
        evaluationPlaneVersion: undefined,
        measuredDimensions: Object.freeze([]),
        unmeasuredDimensions: Object.freeze(["quality.content"]),
      }),
    );
    const report = analyzeEvidenceGapsAndPlanExperiments({ records, nowIso: () => NOW });
    expect(report.recommendations[0]?.action).toBe("RERUN_EVALUATION_PLANE");
  });

  it("flags model-judged-only gaps via reason codes", () => {
    const modelJudgedRecord = (id: string, model: BenchmarkModelTarget, executionId: string) => {
      const base = controlledRecord({
        id,
        model,
        executionId,
        measuredDimensions: Object.freeze([]),
        unmeasuredDimensions: Object.freeze([]),
      });
      return Object.freeze({
        ...base,
        provenance: Object.freeze([
          ...(base.provenance ?? []),
          { field: "independent.visual_quality", value: "MODEL_JUDGED" },
        ]),
      });
    };
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: Array.from({ length: 6 }, (_, i) =>
        modelJudgedRecord(
          `mj_${i}`,
          i % 2 === 0 ? modelA : modelB,
          `exec_mj_${i % 3}`,
        ),
      ),
      nowIso: () => NOW,
    });
    expect(report.gaps[0]?.reasonCodes).toContain("MODEL_JUDGED_ONLY");
    expect(report.recommendations[0]?.action).toBe("RERUN_EVALUATION_PLANE");
  });

  it("blocks experimentation for evaluation failure", () => {
    const failed = controlledRecord({
      id: "fail_1",
      benchmarkOutcome: "CONTRACT_FAILURE",
      validForModelComparison: false,
    });
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [failed],
      nowIso: () => NOW,
    });
    expect(report.gaps[0]?.readinessState).toBe("BLOCKED");
    expect(report.gaps[0]?.reasonCodes).toContain("EVALUATION_FAILURE");
    expect(report.recommendations[0]?.action).toBe("BLOCKED_BY_GOVERNANCE");
    expect(report.recommendations[0]?.totalInvocations).toBe(0);
  });

  it("selects eligible comparison candidates from registry", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: Array.from({ length: 6 }, (_, i) =>
        controlledRecord({
          id: `elig_${i}`,
          model: modelA,
          executionId: `exec_elig_${i % 2}`,
        }),
      ),
      nowIso: () => NOW,
    });
    const candidate = report.recommendations[0]?.candidates[0];
    expect(candidate).toBeDefined();
    expect(TIER1_CONTROLLED_EVIDENCE_MODELS.some((m) => m.modelId === candidate?.modelId)).toBe(
      true,
    );
    expect(candidate?.modelId).not.toBe(modelA.modelId);
  });

  it("reports multiple independent gaps without merging scopes", () => {
    const gapA = [
      controlledRecord({ id: "ga1", model: modelA, industry: "healthcare" }),
      controlledRecord({ id: "ga2", model: modelB, industry: "healthcare" }),
    ];
    const gapB = [
      controlledRecord({ id: "gb1", model: modelA, industry: "finance" }),
      controlledRecord({ id: "gb2", model: modelB, industry: "finance" }),
    ];
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [...gapA, ...gapB],
      nowIso: () => NOW,
    });
    expect(report.gaps.length).toBe(2);
    const industries = report.gaps.map((g) => g.scope.industry).sort();
    expect(industries).toEqual(["finance", "healthcare"]);
    expect(report.recommendations.length).toBe(2);
  });

  it("flags heuristic-only gaps via reason codes", () => {
    const heuristic = Array.from({ length: 6 }, (_, i) =>
      controlledRecord({
        id: `h_${i}`,
        model: i % 2 === 0 ? modelA : modelB,
        executionId: `exec_h_${i % 2}`,
        measuredDimensions: Object.freeze([]),
        unmeasuredDimensions: Object.freeze(["quality.visual_quality"]),
      }),
    );
    const report = analyzeEvidenceGapsAndPlanExperiments({ records: heuristic, nowIso: () => NOW });
    expect(report.gaps[0]?.reasonCodes).toContain("HEURISTIC_ONLY_EVALUATION");
  });

  it("blocks recommendation for governance-restricted scope", () => {
    const records = sufficientControlledSet();
    const fullKey = buildEvidenceScopeKey(records[0]!);
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records,
      governanceBlockedScopeKeys: [fullKey],
      nowIso: () => NOW,
    });
    expect(report.recommendations[0]?.action).toBe("BLOCKED_BY_GOVERNANCE");
    expect(report.recommendations[0]?.governanceStatus).toBe("BLOCKED");
    expect(report.recommendations[0]?.totalInvocations).toBe(0);
  });

  it("returns NO_ELIGIBLE_CANDIDATE when registry exhausted", () => {
    const onlyModel = TIER1_CONTROLLED_EVIDENCE_MODELS[0]!;
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: Array.from({ length: 6 }, (_, i) =>
        controlledRecord({
          id: `one_${i}`,
          model: onlyModel,
          executionId: `exec_one_${i % 2}`,
        }),
      ),
      eligibleModels: [onlyModel],
      nowIso: () => NOW,
    });
    expect(report.recommendations[0]?.action).toBe("NO_ELIGIBLE_CANDIDATE");
    expect(report.gaps[0]?.reasonCodes).toContain("NO_ELIGIBLE_CANDIDATE");
  });

  it("isolates multiple independent gaps by scope", () => {
    const sufficient = sufficientControlledSet();
    const insufficientHealthcare = [
      controlledRecord({ id: "h1", model: modelA, industry: "healthcare" }),
      controlledRecord({ id: "h2", model: modelB, industry: "healthcare" }),
    ];
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [...sufficient, ...insufficientHealthcare],
      nowIso: () => NOW,
    });
    expect(report.observations.length).toBeGreaterThanOrEqual(1);
    expect(report.gaps.length).toBe(1);
    expect(report.gaps[0]?.scope.industry).toBe("healthcare");
    const scopeKeys = new Set(report.gaps.map((g) => g.scope.scopeKey));
    expect(scopeKeys.size).toBe(report.gaps.length);
  });

  it("prefers targeted strategy over full matrix", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [productionRecord("x")],
      nowIso: () => NOW,
    });
    expect(report.recommendations[0]?.strategy).toBe("targeted");
    expect(report.recommendations[0]?.strategy).not.toBe("full_matrix");
  });

  it("never marks recommendations as executable", () => {
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: [
        productionRecord("a"),
        ...Array.from({ length: 2 }, (_, i) =>
          controlledRecord({ id: `c_${i}`, model: i === 0 ? modelA : modelB }),
        ),
      ],
      nowIso: () => NOW,
    });
    for (const rec of report.recommendations) {
      expect(rec.executable).toBe(false);
      expect(rec.kind).toBe("RECOMMENDATION");
    }
  });

  it("produces deterministic output on repeated calculation", () => {
    const records = [productionRecord("d")];
    const a = analyzeEvidenceGapsAndPlanExperiments({ records, nowIso: () => NOW });
    const b = analyzeEvidenceGapsAndPlanExperiments({ records, nowIso: () => NOW });
    expect(a.recommendations[0]?.action).toBe(b.recommendations[0]?.action);
    expect(a.recommendations[0]?.totalInvocations).toBe(b.recommendations[0]?.totalInvocations);
  });

  it("adaptive routing remains OFF", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    const report = analyzeEvidenceGapsAndPlanExperiments({
      records: sufficientControlledSet(),
      nowIso: () => NOW,
    });
    expect(report.adaptiveRoutingActivated).toBe(false);
  });
});
