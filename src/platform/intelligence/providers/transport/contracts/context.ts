/**
 * Transport context + metadata contracts.
 *
 * Purpose: Shared, immutable context threaded through the pipeline + middleware.
 * Responsibilities: Correlate a transport operation; carry non-secret attributes.
 * Usage: Created by the engine; passed to pipeline, middleware, clients.
 * Future Extension: Trace/span propagation.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { TransportProtocol } from "./enums";
import type { TransportSessionId } from "./identifiers";

export interface TransportMetadata {
  readonly attempt: number;
  readonly protocol: TransportProtocol;
  readonly region?: string;
  readonly reusedConnection?: boolean;
  readonly tags: Readonly<Record<string, string>>;
}

export interface TransportContext {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly protocol: TransportProtocol;
  readonly sessionId?: TransportSessionId;
  /** Non-secret, middleware-observable attributes. */
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
}
