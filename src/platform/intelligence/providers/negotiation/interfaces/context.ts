/**
 * Negotiation context.
 *
 * Purpose: Shared, immutable input passed to every negotiator.
 * Responsibilities: Carry the request + the provider/model under consideration.
 * Usage: Built by the engine per candidate provider.
 * Future Extension: Cached resolved artifacts to avoid re-resolution.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { NegotiationRequest } from "../contracts/negotiation-request";

export interface NegotiationContext {
  readonly request: NegotiationRequest;
  /** The provider currently under consideration (primary or fallback). */
  readonly providerId: ProviderId;
  /** The model under consideration (from the plan or a preference). */
  readonly modelId?: string;
}
