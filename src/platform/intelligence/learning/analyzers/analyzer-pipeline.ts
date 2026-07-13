/**
 * Aggregates all placeholder analyzers into a signal extraction pipeline.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { LearningRequest, LearningSignal } from "../contracts/learning-models";
import { LearningError } from "../errors";
import type { IAnalyzer, ISignalExtractor } from "../interfaces/learning-ports";
import { BrandAnalyzer } from "./brand-analyzer";
import { CostAnalyzer } from "./cost-analyzer";
import { EvaluationAnalyzer } from "./evaluation-analyzer";
import { HumanAnalyzer } from "./human-analyzer";
import { KnowledgeAnalyzer } from "./knowledge-analyzer";
import { LatencyAnalyzer } from "./latency-analyzer";
import { MemoryAnalyzer } from "./memory-analyzer";
import { PromptAnalyzer } from "./prompt-analyzer";
import { ProviderAnalyzer } from "./provider-analyzer";
import { QualityAnalyzer } from "./quality-analyzer";
import { RoutingAnalyzer } from "./routing-analyzer";
import { WorkflowAnalyzer } from "./workflow-analyzer";

export function createDefaultAnalyzers(): readonly IAnalyzer[] {
  return [
    new ProviderAnalyzer(),
    new PromptAnalyzer(),
    new BrandAnalyzer(),
    new HumanAnalyzer(),
    new WorkflowAnalyzer(),
    new CostAnalyzer(),
    new LatencyAnalyzer(),
    new QualityAnalyzer(),
    new EvaluationAnalyzer(),
    new KnowledgeAnalyzer(),
    new MemoryAnalyzer(),
    new RoutingAnalyzer(),
  ];
}

export class AnalyzerSignalExtractor implements ISignalExtractor {
  constructor(private readonly analyzers: readonly IAnalyzer[]) {}

  async extract(request: LearningRequest): Promise<Result<readonly LearningSignal[]>> {
    if (!request.artifacts.length) {
      return failure(new LearningError("artifacts are required for signal extraction"));
    }

    const signals: LearningSignal[] = [];
    const context = { request, artifacts: request.artifacts };

    for (const analyzer of this.analyzers) {
      const result = await analyzer.analyze(context);
      if (!result.ok) {
        return failure(
          new LearningError(`Analyzer ${analyzer.analyzerId} failed`, {
            cause: result.error.message,
          })
        );
      }
      signals.push(...result.value);
    }

    return success(signals);
  }
}
