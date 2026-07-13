/**
 * Verification planning contracts.
 */

import type { VerificationKind } from "./enums";

export interface ExecutionVerificationStep {
  readonly kind: VerificationKind;
  readonly order: number;
  readonly required: boolean;
  readonly description: string;
}

export interface ExecutionVerificationPlan {
  readonly enabled: boolean;
  readonly steps: readonly ExecutionVerificationStep[];
  readonly estimatedOverhead: number;
  readonly rationale: string;
}
