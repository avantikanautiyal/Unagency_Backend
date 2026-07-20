/**
 * Optional dynamic inputs from frozen platforms.
 */

import type { EvaluationReport } from "../../evaluation/contracts/evaluation-models";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { ExecutionOptimizationResult } from "../../execution-optimization/contracts/result";
import type { LearningResult } from "../../learning/contracts/learning-models";

export interface ModelIntelligenceInputs {
  readonly evaluationReports?: readonly EvaluationReport[];
  readonly learningResults?: readonly LearningResult[];
  readonly intelligenceResults?: readonly ExecutionIntelligenceResult[];
  readonly optimizationResults?: readonly ExecutionOptimizationResult[];
}
