/**
 * Step 9 — Applicability-aware experiment matrix (MODEL × BENCHMARK × STRATEGY × KNOWLEDGE).
 */

import { createHash } from "crypto";
import type { BenchmarkCase, BenchmarkModelTarget } from "../../contracts/benchmark-case";
import { getBenchmarkCase } from "../../catalog/benchmark-catalog";
import { resolveModalityProfile } from "../../../../../../os/evaluation/evaluation-plane/modality-profiles";
import { checkBenchmarkCompatibility } from "../../engine/benchmark-compatibility";
import { BENCHMARK_OS_EXECUTOR_PROFILE } from "../../engine/benchmark-execution-profile";
import type { ExperimentMatrixInput } from "../contracts/experiment-definition";
import type { ExperimentStrategyDefinition } from "../contracts/experiment-strategy";
import { isStrategyApplicable } from "../contracts/experiment-strategy";
import type { KnowledgeContextRef } from "../contracts/knowledge-context";
import { isKnowledgeApplicable } from "../contracts/knowledge-context";
import type { ExperimentCellStatus } from "../contracts/experiment-status";
import type { ExperimentComparisonMode } from "../comparison/fair-comparison";

export type ExperimentMatrixCell = {
  readonly cellId: string;
  readonly fingerprint: string;
  readonly benchmarkId: string;
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: ExperimentStrategyDefinition;
  readonly knowledgeContext: KnowledgeContextRef;
  readonly repeatIndex: number;
  readonly status: ExperimentCellStatus;
  readonly skipReason?: string;
};

export type ExperimentMatrixPlan = {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly comparisonMode: ExperimentComparisonMode;
  readonly cells: readonly ExperimentMatrixCell[];
  readonly executableCells: readonly ExperimentMatrixCell[];
  readonly skippedCells: readonly ExperimentMatrixCell[];
  readonly benchmarkCount: number;
  readonly modelCount: number;
  readonly strategyCount: number;
  readonly knowledgeCount: number;
  readonly repeatCount: number;
  readonly totalInvocations: number;
  readonly filteredOutCount: number;
  readonly summary: readonly string[];
};

function cellFingerprint(parts: Record<string, string | number | undefined>): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24);
}

function modalityFromOutputKind(outputKind: string): string {
  const profile = resolveModalityProfile(outputKind);
  if (profile.modality === "image") return "image";
  if (profile.modality === "video") return "video";
  if (outputKind === "deferred_website" || outputKind === "website") return "website";
  if (outputKind === "presentation") return "presentation";
  if (outputKind === "document") return "document";
  return "text";
}

function strategyModalityApplicable(
  strategy: ExperimentStrategyDefinition,
  outputKind: string,
): boolean {
  const modalities = strategy.applicability.modalities;
  if (!modalities?.length) return true;
  return modalities.includes(modalityFromOutputKind(outputKind) as never);
}

function evaluateCell(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly strategy: ExperimentStrategyDefinition;
  readonly knowledge: KnowledgeContextRef;
}): { readonly status: ExperimentCellStatus; readonly skipReason?: string } {
  const bc = input.benchmarkCase;
  const strategyCheck = isStrategyApplicable(input.strategy, bc);
  if (!strategyCheck.applicable) {
    return Object.freeze({ status: "SKIPPED_NOT_APPLICABLE", skipReason: strategyCheck.reason });
  }
  if (!strategyModalityApplicable(input.strategy, bc.outputKind)) {
    return Object.freeze({
      status: "SKIPPED_NOT_APPLICABLE",
      skipReason: `strategy ${input.strategy.strategyId} not applicable to ${bc.outputKind}`,
    });
  }
  const knowledgeCheck = isKnowledgeApplicable(input.knowledge, {
    service: bc.service,
    subtype: bc.subtype,
    industry: bc.industry,
    benchmarkId: bc.benchmarkId,
  });
  if (!knowledgeCheck.applicable) {
    return Object.freeze({ status: "SKIPPED_NOT_APPLICABLE", skipReason: knowledgeCheck.reason });
  }
  const compat = checkBenchmarkCompatibility({
    benchmarkCase: bc,
    modelId: input.model.modelId,
    executionProfile: BENCHMARK_OS_EXECUTOR_PROFILE,
  });
  if (compat.skipExecution) {
    return Object.freeze({
      status: "SKIPPED_INCOMPATIBLE",
      skipReason: compat.reasons.join("; "),
    });
  }
  return Object.freeze({ status: "PLANNED" });
}

export function buildExperimentMatrix(input: ExperimentMatrixInput): ExperimentMatrixPlan {
  const experimentVersion = input.experimentVersion ?? "1.0.0";
  const repeatCount = Math.max(1, input.repeatCount ?? 1);
  const comparisonMode = input.comparisonMode ?? "combination";
  const cells: ExperimentMatrixCell[] = [];
  let filteredOut = 0;

  for (const benchmarkId of input.benchmarkIds) {
    const benchmarkCase = getBenchmarkCase(benchmarkId);
    if (!benchmarkCase) {
      filteredOut += 1;
      continue;
    }
    if (input.services?.length && !input.services.includes(benchmarkCase.service)) continue;
    if (input.industries?.length && benchmarkCase.industry && !input.industries.includes(benchmarkCase.industry)) continue;
    if (input.complexities?.length && !input.complexities.includes(benchmarkCase.complexity)) continue;

    for (const model of input.models) {
      for (const strategy of input.strategies) {
        for (const knowledgeContext of input.knowledgeContexts) {
          const evalResult = evaluateCell({ benchmarkCase, model, strategy, knowledge: knowledgeContext });
          for (let rep = 0; rep < repeatCount; rep++) {
            const fingerprint = cellFingerprint({
              experimentId: input.experimentId,
              benchmarkId,
              modelId: model.modelId,
              strategyId: strategy.strategyId,
              strategyVersion: strategy.version,
              knowledgeId: knowledgeContext.knowledgeId,
              knowledgeVersion: knowledgeContext.knowledgeVersion,
              repeatIndex: rep,
            });
            cells.push(
              Object.freeze({
                cellId: `${input.experimentId}_${fingerprint}`,
                fingerprint,
                benchmarkId,
                benchmarkCase,
                model,
                strategy,
                knowledgeContext,
                repeatIndex: rep,
                status: evalResult.status,
                skipReason: evalResult.skipReason,
              }),
            );
          }
        }
      }
    }
  }

  const executableCells = cells.filter((c) => c.status === "PLANNED");
  const skippedCells = cells.filter((c) => c.status !== "PLANNED");

  const summary = [
    `Experiment: ${input.experimentId} v${experimentVersion}`,
    `Comparison mode: ${comparisonMode}`,
    `Benchmarks: ${input.benchmarkIds.length}`,
    `Models: ${input.models.length}`,
    `Strategies: ${input.strategies.length}`,
    `Knowledge contexts: ${input.knowledgeContexts.length}`,
    `Repeats: ${repeatCount}`,
    `Total cells: ${cells.length}`,
    `Executable: ${executableCells.length}`,
    `Skipped: ${skippedCells.length}`,
    `Planned invocations: ${executableCells.length}`,
  ];

  return Object.freeze({
    experimentId: input.experimentId,
    experimentVersion,
    comparisonMode,
    cells: Object.freeze(cells),
    executableCells: Object.freeze(executableCells),
    skippedCells: Object.freeze(skippedCells),
    benchmarkCount: input.benchmarkIds.length,
    modelCount: input.models.length,
    strategyCount: input.strategies.length,
    knowledgeCount: input.knowledgeContexts.length,
    repeatCount,
    totalInvocations: executableCells.length,
    filteredOutCount: filteredOut + skippedCells.length,
    summary: Object.freeze(summary),
  });
}

export function formatExperimentMatrixPlan(plan: ExperimentMatrixPlan): string {
  return [
    "=== Step 9 Experiment Matrix Plan ===",
    ...plan.summary,
    "",
    "Sample executable cells:",
    ...plan.executableCells.slice(0, 6).map(
      (c) =>
        `  ${c.benchmarkId} × ${c.model.modelId} × ${c.strategy.strategyId} × ${c.knowledgeContext.knowledgeId}` +
        (c.repeatIndex > 0 ? ` [rep ${c.repeatIndex + 1}]` : ""),
    ),
    plan.executableCells.length > 6
      ? `  ... and ${plan.executableCells.length - 6} more executable cells`
      : "",
    plan.skippedCells.length
      ? `\nSkipped (${plan.skippedCells.length}): ${plan.skippedCells[0]?.skipReason ?? "n/a"}`
      : "",
  ].join("\n");
}
