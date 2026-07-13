/**
 * Evaluation configuration placeholders for future milestones.
 */

export interface EvaluationConfig {
  readonly enabled: boolean;
  readonly sampleRate: number;
}

export function loadEvaluationConfig(): EvaluationConfig {
  return {
    enabled:
      (process.env.INTELLIGENCE_EVALUATION_ENABLED ?? "false").toLowerCase() ===
      "true",
    sampleRate: Number(process.env.INTELLIGENCE_EVALUATION_SAMPLE_RATE ?? 0),
  };
}
