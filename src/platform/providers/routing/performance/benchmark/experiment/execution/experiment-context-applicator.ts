/**
 * Step 9 — Apply strategy + knowledge to benchmark execution context (no pipeline bypass).
 */

import type { BenchmarkCase } from "../../contracts/benchmark-case";
import type { ExperimentStrategyDefinition } from "../contracts/experiment-strategy";
import { toBenchmarkStrategy } from "../contracts/experiment-strategy";
import type { KnowledgeContextRef } from "../contracts/knowledge-context";
import { applyKnowledgeToBrief, knowledgeVersionTag } from "../contracts/knowledge-context";

export type ExperimentExecutionContext = {
  readonly benchmarkCase: BenchmarkCase;
  readonly strategy: ExperimentStrategyDefinition;
  readonly knowledgeContext: KnowledgeContextRef;
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly metadataOverlay: Readonly<Record<string, unknown>>;
};

export function applyStrategyConfigurationToPrompt(
  brief: string,
  strategy: ExperimentStrategyDefinition,
): string {
  const config = strategy.configuration;
  const augmentation = config.promptAugmentation;
  if (augmentation === "quality_emphasis") {
    return `${brief}\n\n[STRATEGY: ${strategy.strategyId}] Prioritize Output Contract adherence, measurable hard requirements, and quality dimensions.`;
  }
  if (augmentation === "concise") {
    return `${brief}\n\n[STRATEGY: ${strategy.strategyId}] Be concise while meeting all contract requirements.`;
  }
  return brief;
}

export function buildExperimentExecutionContext(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly strategy: ExperimentStrategyDefinition;
  readonly knowledgeContext: KnowledgeContextRef;
  readonly experimentId: string;
  readonly experimentVersion?: string;
}): ExperimentExecutionContext {
  const withKnowledge = applyKnowledgeToBrief(input.benchmarkCase.inputBrief, input.knowledgeContext);
  const withStrategy = applyStrategyConfigurationToPrompt(withKnowledge, input.strategy);
  const benchmarkStrategy = toBenchmarkStrategy(input.strategy);

  const benchmarkCase: BenchmarkCase = Object.freeze({
    ...input.benchmarkCase,
    inputBrief: withStrategy,
  });

  const metadataOverlay = Object.freeze({
    experimentId: input.experimentId,
    experimentVersion: input.experimentVersion ?? "1.0.0",
    strategyId: benchmarkStrategy.strategyId,
    strategyVersion: benchmarkStrategy.version,
    strategyConfiguration: input.strategy.configuration,
    knowledgeId: input.knowledgeContext.knowledgeId,
    knowledgeVersion: input.knowledgeContext.knowledgeVersion,
    knowledgeFingerprint: input.knowledgeContext.contentFingerprint,
    knowledgeVersionTag: knowledgeVersionTag(input.knowledgeContext),
    knowledgeScope: input.knowledgeContext.scope,
    knowledgeSourceReferences: input.knowledgeContext.sourceReferences,
  });

  return Object.freeze({
    benchmarkCase,
    strategy: input.strategy,
    knowledgeContext: input.knowledgeContext,
    experimentId: input.experimentId,
    experimentVersion: input.experimentVersion ?? "1.0.0",
    metadataOverlay,
  });
}
