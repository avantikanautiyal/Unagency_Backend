/**
 * Quality prediction contracts.
 */

export interface ExecutionQualityEstimate {
  readonly expectedQuality: number;
  readonly hallucinationRisk: number;
  readonly completeness: number;
  readonly confidence: number;
  readonly needsReasoning: boolean;
  readonly needsVerification: boolean;
  readonly rationale: string;
}

export interface ExecutionPrediction {
  readonly quality: ExecutionQualityEstimate;
  readonly estimatedPasses: number;
  readonly estimatedLatencyMs: number;
  readonly estimatedCost: number;
}
