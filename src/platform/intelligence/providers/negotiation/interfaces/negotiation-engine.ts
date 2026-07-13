/**
 * Negotiation engine port + event publisher port.
 *
 * Purpose: The platform facade contract + optional event publishing.
 * Responsibilities: Produce a NegotiationResult from a NegotiationRequest.
 * Usage: The future orchestrator calls negotiate() before the runtime.
 * Future Extension: Streaming negotiation progress events.
 */

import type { Result } from "../../../shared/result";
import type { NegotiationRequest } from "../contracts/negotiation-request";
import type { NegotiationResult } from "../contracts/negotiation-result";

export interface IProviderNegotiationEngine {
  negotiate(
    request: NegotiationRequest
  ): Promise<Result<NegotiationResult>>;
}

export interface INegotiationEventPublisher {
  publish(result: NegotiationResult): Promise<void>;
}
