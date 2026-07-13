/**
 * Health, capability, snapshot, and result contracts.
 *
 * Purpose: Observability + capability descriptors + terminal result.
 * Responsibilities: Describe protocol capability, health, snapshots, outcomes.
 * Usage: Produced by health monitor, protocol catalog, engine.
 * Future Extension: SLO fields, capacity metrics.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  CompressionAlgorithm,
  TransportHealthState,
  TransportProtocol,
  TransportSessionState,
} from "./enums";
import type { ConnectionId, TransportSessionId } from "./identifiers";
import type { CanonicalProviderResponse } from "./canonical";
import type { TransportError, TransportStatistics } from "./errors";

export interface TransportCapability {
  readonly protocol: TransportProtocol;
  readonly streaming: boolean;
  readonly bidirectional: boolean;
  readonly keepAlive: boolean;
  readonly multiplexing: boolean;
  readonly compression: readonly CompressionAlgorithm[];
}

export interface TransportHealth {
  readonly protocol: TransportProtocol;
  readonly state: TransportHealthState;
  readonly connectionHealthy: boolean;
  readonly poolHealthy: boolean;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TransportSnapshot {
  readonly sessionId: TransportSessionId;
  readonly requestId: string;
  readonly protocol: TransportProtocol;
  readonly state: TransportSessionState;
  readonly connectionId?: ConnectionId;
  readonly statistics: TransportStatistics;
  readonly capturedAt: string;
}

/**
 * Terminal outcome of a transport operation (the engine's public result).
 */
export interface TransportResult {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly sessionId: TransportSessionId;
  readonly success: boolean;
  readonly response?: CanonicalProviderResponse;
  readonly error?: TransportError;
  readonly statistics: TransportStatistics;
  readonly completedAt: string;
}
