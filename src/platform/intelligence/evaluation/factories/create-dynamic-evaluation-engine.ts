/**
 * Dynamic Evaluation factory — additive; existing createIntelligenceEvaluationEngine untouched.
 */

import { DynamicEvaluationEngine } from "../engine/dynamic-evaluation-engine";
import { createDefaultJudgeRegistry } from "../judge-registry/default-judge-registry";
import { DefaultEvaluationStrategyResolver } from "../strategy-resolver/default-strategy-resolver";
import { DefaultJudgeSelector } from "../judge-selection/default-judge-selector";
import { DefaultJudgeWeightingEngine } from "../weighting/default-weighting-engine";
import { DefaultEvidencePlanner } from "../evidence/default-evidence-planner";
import { DefaultBenchmarkResolver } from "../benchmarks/default-benchmark-resolver";
import { DefaultDynamicExplainabilityBuilder } from "../explainability/dynamic-explainability";
import { DefaultEvaluationLearningSignalEmitter } from "../feedback/learning-signal-emitter";
import type { IDynamicEvaluationEngine } from "../interfaces/dynamic-evaluation-ports";
import type { IJudgeRegistry } from "../interfaces/dynamic-evaluation-ports";

export interface DynamicEvaluationPlatform {
  readonly engine: IDynamicEvaluationEngine;
  readonly registry: IJudgeRegistry;
}

export interface CreateDynamicEvaluationOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly registry?: IJudgeRegistry;
}

export function createDynamicEvaluationPlatform(
  options: CreateDynamicEvaluationOptions = {}
): DynamicEvaluationPlatform {
  const registry = options.registry ?? createDefaultJudgeRegistry();
  const engine = new DynamicEvaluationEngine({
    registry,
    strategyResolver: new DefaultEvaluationStrategyResolver(),
    judgeSelector: new DefaultJudgeSelector(),
    weighting: new DefaultJudgeWeightingEngine(),
    evidencePlanner: new DefaultEvidencePlanner(),
    benchmarkResolver: new DefaultBenchmarkResolver(),
    explainability: new DefaultDynamicExplainabilityBuilder(),
    learningSignals: new DefaultEvaluationLearningSignalEmitter(),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });
  return { engine, registry };
}
