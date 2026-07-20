/**
 * Execution constraint contracts.
 */

import type { PrivacyLevel } from "./enums";

export interface ExecutionConstraintProfile {
  readonly budgetSensitive: boolean;
  readonly latencySensitive: boolean;
  readonly privacyLevel: PrivacyLevel;
  readonly regionConstraints: readonly string[];
  readonly modelRestrictions: readonly string[];
  readonly policyConstraints: readonly string[];
  readonly expectedInputTokens: number;
  readonly expectedOutputTokens: number;
  readonly rationale: string;
}
