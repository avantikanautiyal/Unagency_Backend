/**
 * Errors for the Provider Negotiation Platform.
 *
 * Purpose: Typed errors extending IntelligenceError.
 * Responsibilities: Represent malformed inputs / unexpected negotiation faults.
 * Usage: Returned via Result<T> failures (business rejection is NOT an error).
 * Future Extension: Per-stage error mapping.
 */

import { IntelligenceError } from "../../../shared/errors";

export class NegotiationError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "EXECUTION_ERROR", metadata, cause });
    this.name = "NegotiationError";
  }
}

export class NegotiationInputError extends IntelligenceError {
  constructor(
    message: string,
    metadata?: Readonly<Record<string, unknown>>,
    cause?: unknown
  ) {
    super(message, { code: "VALIDATION_ERROR", metadata, cause });
    this.name = "NegotiationInputError";
  }
}
