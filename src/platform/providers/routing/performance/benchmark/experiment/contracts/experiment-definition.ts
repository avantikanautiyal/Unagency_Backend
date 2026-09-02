/**
 * Step 9 — Controlled experiment definition (references BenchmarkCase, does not duplicate prompts).
 */

import type { BenchmarkCase, BenchmarkModelTarget } from "../../contracts/benchmark-case";
import type { ExperimentStrategyDefinition } from "./experiment-strategy";
import type { KnowledgeContextRef } from "./knowledge-context";
import type { ExperimentComparisonMode } from "../comparison/fair-comparison";

export const EXPERIMENT_SYSTEM_VERSION = "1.0.0" as const;

export type ExperimentEvaluationConditions = {
  readonly contractVersion?: string;
  readonly evaluatorVersion?: string;
  readonly executionProfileId?: string;
  readonly comparisonMode?: ExperimentComparisonMode;
};

export type ExperimentDefinition = {
  readonly experimentId: string;
  readonly experimentVersion: typeof EXPERIMENT_SYSTEM_VERSION;
  readonly label?: string;
  readonly benchmarkId: string;
  readonly model: BenchmarkModelTarget;
  readonly strategy: ExperimentStrategyDefinition;
  readonly knowledgeContext: KnowledgeContextRef;
  readonly service: string;
  readonly subtype: string;
  readonly industry?: string;
  readonly complexity: BenchmarkCase["complexity"];
  readonly evaluationConditions: ExperimentEvaluationConditions;
  readonly enabled: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ExperimentMatrixInput = {
  readonly experimentId: string;
  readonly experimentVersion?: typeof EXPERIMENT_SYSTEM_VERSION;
  readonly benchmarkIds: readonly string[];
  readonly models: readonly BenchmarkModelTarget[];
  readonly strategies: readonly ExperimentStrategyDefinition[];
  readonly knowledgeContexts: readonly KnowledgeContextRef[];
  readonly repeatCount?: number;
  readonly comparisonMode?: ExperimentComparisonMode;
  readonly services?: readonly string[];
  readonly industries?: readonly string[];
  readonly complexities?: readonly string[];
};
