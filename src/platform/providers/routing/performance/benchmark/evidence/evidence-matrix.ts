/**
 * Step 8 — Applicability-aware evidence matrix generation.
 */

import type { BenchmarkCase, BenchmarkModelTarget, BenchmarkStrategy } from "../contracts/benchmark-case";
import { listBenchmarkCases, getBenchmarkCase } from "../catalog/benchmark-catalog";
import { PILOT_BENCHMARK_IDS } from "../catalog/benchmark-pilot-catalog";
import { resolveModalityProfile } from "../../../../../os/evaluation/evaluation-plane/modality-profiles";
import { planBenchmarkInvocations } from "../contracts/benchmark-execution-config";
import type { EvidenceCollectionBudget } from "./evidence-collection-config";

export type CoverageStrategy =
  | "pilot"
  | "targeted"
  | "service_suite"
  | "industry_suite"
  | "modality_suite"
  | "complexity_suite"
  | "full_matrix";

export type EvidenceMatrixScope = {
  readonly strategy: CoverageStrategy;
  readonly benchmarkIds?: readonly string[];
  readonly services?: readonly string[];
  readonly industries?: readonly string[];
  readonly outputKinds?: readonly string[];
  readonly complexities?: readonly string[];
  readonly models: readonly BenchmarkModelTarget[];
  readonly strategies?: readonly BenchmarkStrategy[];
  readonly knowledgeVersions?: readonly string[];
  readonly repeatCount?: number;
};

export type EvidenceMatrixCell = {
  readonly benchmarkId: string;
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy?: BenchmarkStrategy;
  readonly knowledgeVersion?: string;
  readonly repeatIndex?: number;
};

export type EvidenceMatrixPlan = {
  readonly strategy: CoverageStrategy;
  readonly cells: readonly EvidenceMatrixCell[];
  readonly benchmarkCount: number;
  readonly modelCount: number;
  readonly strategyVariantCount: number;
  readonly knowledgeVariantCount: number;
  readonly repeatCount: number;
  readonly totalInvocations: number;
  readonly filteredOutCount: number;
  readonly summary: readonly string[];
};

function isApplicableBenchmarkCase(bc: BenchmarkCase): boolean {
  const profile = resolveModalityProfile(bc.outputKind);
  return profile.supportsStatic || profile.supportsRendered;
}

function filterCases(scope: EvidenceMatrixScope): BenchmarkCase[] {
  let cases: BenchmarkCase[];

  switch (scope.strategy) {
    case "pilot":
      cases = PILOT_BENCHMARK_IDS.map((id) => getBenchmarkCase(id)).filter(Boolean) as BenchmarkCase[];
      break;
    case "targeted":
      cases = (scope.benchmarkIds ?? [])
        .map((id) => getBenchmarkCase(id))
        .filter(Boolean) as BenchmarkCase[];
      break;
    case "service_suite":
      cases = listBenchmarkCases({
        service: scope.services?.length === 1 ? scope.services[0] : undefined,
      }).filter((c) => !scope.services?.length || scope.services.includes(c.service));
      break;
    case "industry_suite":
      cases = listBenchmarkCases().filter(
        (c) => !scope.industries?.length || (c.industry && scope.industries.includes(c.industry)),
      );
      break;
    case "modality_suite":
      cases = listBenchmarkCases().filter(
        (c) => !scope.outputKinds?.length || scope.outputKinds.includes(c.outputKind),
      );
      break;
    case "complexity_suite":
      cases = listBenchmarkCases().filter(
        (c) => !scope.complexities?.length || scope.complexities.includes(c.complexity),
      );
      break;
    case "full_matrix":
      cases = listBenchmarkCases();
      break;
    default:
      cases = [];
  }

  const beforeCount = cases.length;
  cases = cases.filter(isApplicableBenchmarkCase);

  if (scope.services?.length && scope.strategy !== "service_suite") {
    cases = cases.filter((c) => scope.services!.includes(c.service));
  }
  if (scope.industries?.length && scope.strategy !== "industry_suite") {
    cases = cases.filter((c) => c.industry && scope.industries!.includes(c.industry));
  }
  if (scope.outputKinds?.length && scope.strategy !== "modality_suite") {
    cases = cases.filter((c) => scope.outputKinds!.includes(c.outputKind));
  }
  if (scope.complexities?.length && scope.strategy !== "complexity_suite") {
    cases = cases.filter((c) => scope.complexities!.includes(c.complexity));
  }

  return cases;
}

export function buildEvidenceMatrix(scope: EvidenceMatrixScope): EvidenceMatrixPlan {
  const cases = filterCases(scope);
  const totalBeforeFilter = listBenchmarkCases().length;
  const repeatCount = Math.max(1, scope.repeatCount ?? 1);
  const strategyVariants = scope.strategies?.length ? scope.strategies : [undefined];
  const knowledgeVariants = scope.knowledgeVersions?.length
    ? scope.knowledgeVersions
    : [undefined];

  const cells: EvidenceMatrixCell[] = [];

  for (const benchmarkCase of cases) {
    for (const model of scope.models) {
      for (const strategy of strategyVariants) {
        for (const knowledgeVersion of knowledgeVariants) {
          for (let rep = 0; rep < repeatCount; rep++) {
            cells.push(
              Object.freeze({
                benchmarkId: benchmarkCase.benchmarkId,
                benchmarkCase,
                model,
                strategy,
                knowledgeVersion,
                repeatIndex: rep,
              }),
            );
          }
        }
      }
    }
  }

  const invocationPlan = planBenchmarkInvocations({
    benchmarkIds: cases.map((c) => c.benchmarkId),
    models: scope.models,
    repeatCount:
      repeatCount * strategyVariants.length * knowledgeVariants.length,
  });

  const summary = [
    `Strategy: ${scope.strategy}`,
    `Benchmarks: ${cases.length} applicable (${totalBeforeFilter} total in catalog)`,
    `Models: ${scope.models.map((m) => m.modelId).join(", ")}`,
    `Repeats: ${repeatCount}`,
    ...(scope.industries?.length ? [`Industries: ${scope.industries.join(", ")}`] : []),
    ...(scope.services?.length ? [`Services: ${scope.services.join(", ")}`] : []),
    `Total invocations: ${cells.length}`,
  ];

  return Object.freeze({
    strategy: scope.strategy,
    cells: Object.freeze(cells),
    benchmarkCount: cases.length,
    modelCount: scope.models.length,
    strategyVariantCount: strategyVariants.length,
    knowledgeVariantCount: knowledgeVariants.length,
    repeatCount,
    totalInvocations: cells.length,
    filteredOutCount: Math.max(0, totalBeforeFilter - cases.length),
    summary: Object.freeze(summary),
  });
}

export function formatEvidenceMatrixPlan(plan: EvidenceMatrixPlan): string {
  return [
    "=== Evidence Collection Matrix Plan ===",
    ...plan.summary,
    "",
    "Sample cells:",
    ...plan.cells.slice(0, 8).map(
      (c) =>
        `  ${c.benchmarkId} × ${c.model.modelId}` +
        (c.knowledgeVersion ? ` (knowledge=${c.knowledgeVersion})` : "") +
        (c.repeatIndex != null && c.repeatIndex > 0 ? ` [rep ${c.repeatIndex + 1}]` : ""),
    ),
    plan.cells.length > 8 ? `  ... and ${plan.cells.length - 8} more` : "",
  ].join("\n");
}

export function assertEvidenceCollectionBudget(
  plan: EvidenceMatrixPlan,
  budget: EvidenceCollectionBudget,
): void {
  if (plan.totalInvocations > budget.maxInvocations) {
    throw new Error(
      `Evidence collection budget exceeded: ${plan.totalInvocations} invocations planned (max ${budget.maxInvocations}).`,
    );
  }
  if (plan.repeatCount > budget.maxRepeats) {
    throw new Error(
      `Repeat count ${plan.repeatCount} exceeds maxRepeats ${budget.maxRepeats}.`,
    );
  }
  if (
    plan.totalInvocations > budget.largeRunThreshold &&
    !budget.allowLargeRunOverride
  ) {
    throw new Error(
      `Large evidence run blocked: ${plan.totalInvocations} invocations (threshold ${budget.largeRunThreshold}).`,
    );
  }
}
