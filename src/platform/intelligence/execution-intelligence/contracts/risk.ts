/**
 * Risk analysis contracts.
 */

import type { RiskCategory, RiskSeverity } from "./enums";

export interface ExecutionRisk {
  readonly id: string;
  readonly category: RiskCategory;
  readonly severity: RiskSeverity;
  readonly message: string;
  readonly mitigation?: string;
  readonly detected: boolean;
}
