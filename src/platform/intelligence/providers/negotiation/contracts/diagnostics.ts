/**
 * Diagnostics contracts: warnings, failures, evidence.
 *
 * Purpose: Immutable diagnostic records produced during negotiation.
 * Responsibilities: Explain why a decision was made.
 * Usage: Aggregated on the negotiation outcome and NegotiatedExecution.
 * Future Extension: Severity levels, remediation hints.
 */

import type { NegotiationStage } from "./enums";

export interface NegotiationWarning {
  readonly code: string;
  readonly message: string;
  readonly stage: NegotiationStage;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface NegotiationFailure {
  readonly code: string;
  readonly message: string;
  readonly stage: NegotiationStage;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface NegotiationEvidence {
  readonly stage: NegotiationStage;
  readonly detail: string;
  readonly data?: Readonly<Record<string, unknown>>;
}
