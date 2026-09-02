/**
 * Priority 4.4 — Map readiness slices to gaps and minimal experiment recommendations.
 */

import { DEFAULT_BENCHMARK_STRATEGY, type BenchmarkModelTarget } from "../../contracts/benchmark-case";
import {
  buildEvidenceMatrix,
  type CoverageStrategy,
  type EvidenceMatrixCell,
} from "../evidence-matrix";
import {
  DEFAULT_EVIDENCE_READINESS_THRESHOLDS,
  type EvidenceReadinessThresholds,
} from "../readiness/evidence-freshness-config";
import type {
  EvidenceReadinessBlocker,
  EvidenceReadinessSliceReport,
  EvidenceReadinessState,
} from "../readiness/evidence-readiness-contract";
import { TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT } from "../../config/tier1-controlled-evidence-config";
import type {
  EvidenceGap,
  EvidenceGapReasonCode,
  ExperimentRecommendation,
  ExperimentRecommendationAction,
  ExperimentGovernanceStatus,
} from "./evidence-gap-contract";
import { pickPrimaryBenchmarkCase, resolveBenchmarkCasesForScope } from "./benchmark-scope-resolver";
import {
  resolveEligibleComparisonModels,
  selectComparisonCandidate,
  selectModelsForPilot,
} from "./candidate-eligibility";

function gapReasonCodes(blockers: readonly EvidenceReadinessBlocker[]): EvidenceGapReasonCode[] {
  const codes = new Set<EvidenceGapReasonCode>();
  for (const b of blockers) {
    codes.add(b.code as EvidenceGapReasonCode);
  }
  return Object.freeze([...codes]);
}

function missingRequirements(slice: EvidenceReadinessSliceReport): readonly string[] {
  const reqs: string[] = [];
  if (slice.controlledEvidenceCount === 0) {
    reqs.push("controlled_benchmark_evidence");
  }
  if (slice.validComparisonSampleCount < DEFAULT_EVIDENCE_READINESS_THRESHOLDS.insufficientBelow) {
    reqs.push(
      `valid_comparison_samples>=${DEFAULT_EVIDENCE_READINESS_THRESHOLDS.insufficientBelow}`,
    );
  }
  if (slice.comparableCandidateCount < DEFAULT_EVIDENCE_READINESS_THRESHOLDS.minComparableCandidates) {
    reqs.push(
      `comparable_candidates>=${DEFAULT_EVIDENCE_READINESS_THRESHOLDS.minComparableCandidates}`,
    );
  }
  if (slice.repeatCoverage < DEFAULT_EVIDENCE_READINESS_THRESHOLDS.minRepeatsPerBenchmarkCell) {
    reqs.push(
      `repeats_per_cell>=${DEFAULT_EVIDENCE_READINESS_THRESHOLDS.minRepeatsPerBenchmarkCell}`,
    );
  }
  if (slice.evaluationCoverage.recordsWithEvaluationPlane === 0 && slice.controlledEvidenceCount > 0) {
    reqs.push("evaluation_plane_provenance");
  }
  if (slice.freshnessStatus === "STALE") {
    reqs.push("fresh_controlled_rerun");
  }
  return Object.freeze(reqs);
}

export function gapFromReadinessSlice(slice: EvidenceReadinessSliceReport): EvidenceGap | undefined {
  if (slice.readiness === "SUFFICIENT") return undefined;

  const reasonCodes = [...gapReasonCodes(slice.blockers)];
  if (
    slice.controlledEvidenceCount === 0 &&
    !reasonCodes.includes("MISSING_CONTROLLED_EVIDENCE")
  ) {
    reasonCodes.push("MISSING_CONTROLLED_EVIDENCE");
  }
  if (slice.blockers.some((b) => b.code === "PRODUCTION_ONLY_EVIDENCE")) {
    if (!reasonCodes.includes("MISSING_CONTROLLED_EVIDENCE")) {
      reasonCodes.push("MISSING_CONTROLLED_EVIDENCE");
    }
  }

  return Object.freeze({
    scope: slice.scope,
    readinessState: slice.readiness,
    reasonCodes: Object.freeze(reasonCodes),
    evidenceIds: slice.evidenceIds,
    missingRequirements: missingRequirements(slice),
    productionObservationCount: slice.productionEvidenceCountExcluded,
  });
}

function chooseCoverageStrategy(primaryFound: boolean): CoverageStrategy {
  return primaryFound ? "targeted" : "service_suite";
}

function buildMatrixCells(input: {
  readonly strategy: CoverageStrategy;
  readonly benchmarkIds: readonly string[];
  readonly models: readonly BenchmarkModelTarget[];
  readonly repeats: number;
}): { readonly cells: readonly EvidenceMatrixCell[]; readonly totalInvocations: number } {
  const matrix = buildEvidenceMatrix({
    strategy: input.strategy,
    benchmarkIds: [...input.benchmarkIds],
    models: [...input.models],
    repeatCount: input.repeats,
    strategies: [DEFAULT_BENCHMARK_STRATEGY],
  });
  return Object.freeze({
    cells: matrix.cells,
    totalInvocations: matrix.totalInvocations,
  });
}

function expectedImprovement(
  action: ExperimentRecommendationAction,
  current: EvidenceReadinessState,
): EvidenceReadinessState {
  if (action === "BLOCKED_BY_GOVERNANCE" || action === "NO_ELIGIBLE_CANDIDATE") {
    return current;
  }
  if (current === "INSUFFICIENT" || current === "STALE" || current === "INCOMPARABLE") {
    return "PARTIAL";
  }
  return "SUFFICIENT";
}

function primaryAction(slice: EvidenceReadinessSliceReport): ExperimentRecommendationAction {
  const codes = new Set(slice.blockers.map((b) => b.code));
  if (codes.has("GOVERNANCE_BLOCKED") || codes.has("EVALUATION_FAILURE")) {
    return "BLOCKED_BY_GOVERNANCE";
  }
  if (slice.controlledEvidenceCount === 0 || codes.has("PRODUCTION_ONLY_EVIDENCE")) {
    return "RUN_CONTROLLED_PILOT";
  }
  if (codes.has("STALE_EVIDENCE")) return "RERUN_STALE_CELL";
  if (codes.has("INCOMPARABLE_CONFIGURATION") || codes.has("PROVENANCE_MISMATCH")) {
    return "RERUN_CANONICAL_CONFIGURATION";
  }
  if (
    codes.has("EVALUATION_INCOMPLETE") ||
    codes.has("HEURISTIC_ONLY_EVALUATION") ||
    codes.has("MODEL_JUDGED_ONLY")
  ) {
    return "RERUN_EVALUATION_PLANE";
  }
  if (codes.has("INSUFFICIENT_REPEATS")) return "ADD_REPEATS";
  if (codes.has("SINGLE_MODEL_ONLY") || codes.has("NO_COMPARABLE_CANDIDATE")) {
    return "ADD_COMPARISON_CANDIDATE";
  }
  if (codes.has("TOO_FEW_CONTROLLED_SAMPLES")) return "RUN_CONTROLLED_PILOT";
  return "RUN_CONTROLLED_PILOT";
}

export function planExperimentForGap(input: {
  readonly gap: EvidenceGap;
  readonly slice: EvidenceReadinessSliceReport;
  readonly eligibleModels?: readonly BenchmarkModelTarget[];
  readonly thresholds?: EvidenceReadinessThresholds;
}): ExperimentRecommendation {
  const thresholds = input.thresholds ?? DEFAULT_EVIDENCE_READINESS_THRESHOLDS;
  const action = primaryAction(input.slice);
  const governanceStatus: ExperimentGovernanceStatus =
    action === "BLOCKED_BY_GOVERNANCE" ? "BLOCKED" : "ALLOWED";

  if (governanceStatus === "BLOCKED") {
    return Object.freeze({
      kind: "RECOMMENDATION",
      gap: input.gap,
      action,
      strategy: "targeted",
      candidates: Object.freeze([]),
      benchmarkCells: Object.freeze([]),
      repeats: 0,
      totalInvocations: 0,
      expectedEvidenceGain: "none — governance or evaluation failure blocks experimentation",
      expectedReadinessImprovement: input.gap.readinessState,
      rationale: Object.freeze([
        "Governance or evaluation failure prevents controlled experiment recommendation",
        ...input.slice.blockers.map((b) => b.message),
      ]),
      governanceStatus,
      executable: false,
    });
  }

  const primaryCase = pickPrimaryBenchmarkCase(input.gap.scope);
  const strategy = chooseCoverageStrategy(Boolean(primaryCase));
  const benchmarkIds = primaryCase
    ? [primaryCase.benchmarkId]
    : resolveBenchmarkCasesForScope(input.gap.scope)
        .slice(0, 1)
        .map((c) => c.benchmarkId);

  let models: readonly BenchmarkModelTarget[] = [];
  let repeats = TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT;
  const rationale: string[] = [];

  if (action === "ADD_COMPARISON_CANDIDATE") {
    const sel = selectComparisonCandidate({
      slice: input.slice,
      eligibleModels: input.eligibleModels,
    });
    if (sel.status === "NO_ELIGIBLE_CANDIDATE") {
      return Object.freeze({
        kind: "RECOMMENDATION",
        gap: Object.freeze({
          ...input.gap,
          reasonCodes: Object.freeze([...input.gap.reasonCodes, "NO_ELIGIBLE_CANDIDATE"]),
        }),
        action: "NO_ELIGIBLE_CANDIDATE",
        strategy,
        candidates: Object.freeze([]),
        benchmarkCells: Object.freeze([]),
        repeats: 0,
        totalInvocations: 0,
        expectedEvidenceGain: "none — no eligible comparison candidate in registry",
        expectedReadinessImprovement: input.gap.readinessState,
        rationale: Object.freeze(["No eligible candidate model in configured registry"]),
        governanceStatus: "ALLOWED",
        executable: false,
      });
    }
    models = Object.freeze([sel.candidate!]);
    repeats = Math.max(1, thresholds.minRepeatsPerBenchmarkCell);
    rationale.push(
      `Add comparison candidate ${sel.candidate!.modelId} on same benchmark configuration`,
    );
  } else if (action === "ADD_REPEATS") {
    const existing = input.slice.candidates[0];
    models = Object.freeze(
      existing
        ? [
            Object.freeze({
              providerId: existing.providerId,
              modelId: existing.modelId,
              capabilityId: "text.generate",
            }),
          ]
        : resolveEligibleComparisonModels({ eligibleModels: input.eligibleModels }).slice(0, 1),
    );
    const missingRepeats = Math.max(
      0,
      thresholds.minRepeatsPerBenchmarkCell - input.slice.repeatCoverage,
    );
    repeats = missingRepeats > 0 ? missingRepeats : 1;
    rationale.push(
      `Add ${repeats} repeat(s) to reach minimum ${thresholds.minRepeatsPerBenchmarkCell}`,
    );
  } else if (action === "RERUN_STALE_CELL") {
    models = Object.freeze(
      input.slice.candidates.map((c) =>
        Object.freeze({
          providerId: c.providerId,
          modelId: c.modelId,
          capabilityId: "text.generate",
        }),
      ),
    );
    repeats = thresholds.minRepeatsPerBenchmarkCell;
    rationale.push("Rerun stale benchmark cells under current benchmark/evaluation configuration");
    rationale.push("Historical evidence preserved — new controlled run recommended");
  } else if (action === "RERUN_CANONICAL_CONFIGURATION") {
    models = Object.freeze(
      input.slice.candidates.length > 0
        ? input.slice.candidates.map((c) =>
            Object.freeze({
              providerId: c.providerId,
              modelId: c.modelId,
              capabilityId: "text.generate",
            }),
          )
        : selectModelsForPilot({ slice: input.slice, eligibleModels: input.eligibleModels }),
    );
    repeats = thresholds.minRepeatsPerBenchmarkCell;
    rationale.push(
      "Rerun affected candidates under one canonical benchmark/strategy/evaluator configuration",
    );
  } else if (action === "RERUN_EVALUATION_PLANE") {
    models = Object.freeze(
      input.slice.candidates.map((c) =>
        Object.freeze({
          providerId: c.providerId,
          modelId: c.modelId,
          capabilityId: "text.generate",
        }),
      ),
    );
    repeats = 1;
    rationale.push(
      "Rerun evaluation on affected artifacts using current Evaluation Plane capabilities",
    );
  } else {
    models = selectModelsForPilot({
      slice: input.slice,
      eligibleModels: input.eligibleModels,
    });
    repeats = thresholds.minRepeatsPerBenchmarkCell;
    rationale.push("Targeted controlled pilot for exact scope with minimal model set");
    if (input.gap.productionObservationCount > 0) {
      rationale.push(
        `Production observational evidence (${input.gap.productionObservationCount} record(s)) does not close this gap`,
      );
    }
  }

  let cells: readonly EvidenceMatrixCell[] = Object.freeze([]);
  let totalInvocations = 0;
  if (benchmarkIds.length > 0 && models.length > 0) {
    const built = buildMatrixCells({ strategy, benchmarkIds, models, repeats });
    cells = built.cells;
    totalInvocations = built.totalInvocations;
  }

  const expectedGain =
    action === "ADD_REPEATS"
      ? `+${repeats} repeat execution(s) per benchmark cell`
      : action === "ADD_COMPARISON_CANDIDATE"
        ? `+1 comparable candidate model with ${repeats} repeat(s)`
        : `+${totalInvocations} controlled invocation(s) across ${benchmarkIds.length} benchmark(s)`;

  rationale.push(`Strategy: ${strategy} (minimal scope-first)`);
  rationale.push(`Expected gain: ${expectedGain}`);
  rationale.push(`Closes gap: ${input.gap.missingRequirements.join(", ")}`);

  return Object.freeze({
    kind: "RECOMMENDATION",
    gap: input.gap,
    action,
    strategy,
    candidates: models,
    benchmarkCells: cells,
    repeats,
    totalInvocations,
    expectedEvidenceGain: expectedGain,
    expectedReadinessImprovement: expectedImprovement(action, input.gap.readinessState),
    rationale: Object.freeze(rationale),
    governanceStatus,
    executable: false,
  });
}
