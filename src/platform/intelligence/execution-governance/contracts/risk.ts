/**
 * Risk assessment contracts.
 */

import type { RiskCategory, RiskSeverity } from "./enums";

export interface RiskItem {
  readonly riskId: string;
  readonly category: RiskCategory;
  readonly severity: RiskSeverity;
  readonly confidence: number;
  readonly reason: string;
  readonly recommendedMitigation: string;
}

export interface RiskAssessment {
  readonly assessmentId: string;
  readonly risks: readonly RiskItem[];
  readonly overallSeverity: RiskSeverity;
  readonly overallConfidence: number;
  readonly summary: string;
}
