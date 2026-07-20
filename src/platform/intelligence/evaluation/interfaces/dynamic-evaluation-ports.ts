/**
 * Dynamic evaluation ports (additive).
 */

import type { Result } from "../../shared/result";
import type { IJudge } from "./evaluation-ports";
import type { JudgeKind } from "../contracts/evaluation-models";
import type {
  BenchmarkProfile,
  DynamicEvaluationRequest,
  DynamicEvaluationResult,
  DynamicEvaluationStrategy,
  EvidenceRequirements,
  EvaluationExplainabilityReport,
  EvaluationLearningSignal,
  JudgeExecutionPlan,
  JudgeWeightProfile,
} from "../contracts/dynamic-evaluation";

export interface JudgePluginDescriptor {
  readonly pluginId: string;
  readonly kind: JudgeKind;
  readonly displayName: string;
  readonly domains: readonly string[];
  readonly industries: readonly string[];
  readonly tags: readonly string[];
  readonly description: string;
}

export interface IJudgeRegistry {
  register(descriptor: JudgePluginDescriptor, judge: IJudge): Result<void>;
  get(kind: JudgeKind): Result<IJudge | undefined>;
  getDescriptor(kind: JudgeKind): Result<JudgePluginDescriptor | undefined>;
  list(): Result<readonly JudgePluginDescriptor[]>;
  listJudges(): Result<readonly IJudge[]>;
  resolve(kinds: readonly JudgeKind[]): Result<readonly IJudge[]>;
}

export interface IEvaluationStrategyResolver {
  resolve(request: DynamicEvaluationRequest): Result<DynamicEvaluationStrategy>;
}

export interface IJudgeSelector {
  select(
    strategy: DynamicEvaluationStrategy,
    registry: IJudgeRegistry
  ): Result<JudgeExecutionPlan>;
}

export interface IJudgeWeightingEngine {
  weight(
    strategy: DynamicEvaluationStrategy,
    plan: JudgeExecutionPlan
  ): Result<JudgeWeightProfile>;
}

export interface IEvidencePlanner {
  plan(
    strategy: DynamicEvaluationStrategy,
    plan: JudgeExecutionPlan
  ): Result<EvidenceRequirements>;
}

export interface IBenchmarkResolver {
  resolve(
    strategy: DynamicEvaluationStrategy,
    request: DynamicEvaluationRequest
  ): Result<BenchmarkProfile>;
}

export interface IDynamicEvaluationExplainabilityBuilder {
  build(input: {
    readonly strategy: DynamicEvaluationStrategy;
    readonly plan: JudgeExecutionPlan;
    readonly weights: JudgeWeightProfile;
    readonly evidence: EvidenceRequirements;
    readonly benchmark: BenchmarkProfile;
    readonly request: DynamicEvaluationRequest;
  }): Result<EvaluationExplainabilityReport>;
}

export interface IEvaluationLearningSignalEmitter {
  emit(input: {
    readonly strategy: DynamicEvaluationStrategy;
    readonly plan: JudgeExecutionPlan;
    readonly weights: JudgeWeightProfile;
    readonly evaluationPassed: boolean;
    readonly overallScore: number;
  }): Result<readonly EvaluationLearningSignal[]>;
}

export interface IDynamicEvaluationEngine {
  evaluate(request: DynamicEvaluationRequest): Promise<Result<DynamicEvaluationResult>>;
}
