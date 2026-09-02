/**
 * Negotiated constraint contract.
 *
 * Purpose: Immutable record of a single constraint negotiation outcome.
 * Responsibilities: Capture requested vs negotiated values per constraint.
 * Usage: Produced by the constraint negotiator; embedded in NegotiatedExecution.
 * Future Extension: Constraint provenance / source policy references.
 */

import type { ConstraintKind } from "./enums";

export interface NegotiationConstraint {
  readonly kind: ConstraintKind;
  readonly satisfied: boolean;
  readonly requested?: number | string | boolean;
  readonly negotiated?: number | string | boolean;
  readonly reason?: string;
}
