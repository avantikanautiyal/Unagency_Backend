/**
 * Canonical, provider-independent request/response contracts.
 *
 * Purpose: The transport boundary types. Adapters speak ONLY these.
 * Responsibilities: Carry an opaque payload + routing hints (no vendor type).
 * Usage: Input/output of IProviderTransportEngine.
 * Future Extension: Multipart payloads, trailers.
 *
 * `payload` is an opaque provider-shaped map (the adapter's ProviderWirePayload).
 * The transport platform NEVER interprets it and NEVER performs networking.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { CompressionAlgorithm, TransportProtocol } from "./enums";
import type { TransportError, TransportStatistics } from "./errors";

/**
 * A reference to a delivery target. Holds NO secrets and NO live URL is required
 * (an `endpointRef` is a logical reference resolved by a future transport client).
 */
export interface TransportTarget {
  readonly endpointRef?: string;
  readonly region?: string;
  readonly operation: string;
}

export interface CanonicalProviderRequest {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly protocol: TransportProtocol;
  readonly target: TransportTarget;
  /** Opaque provider-shaped payload (no vendor SDK type). */
  readonly payload: ProviderWirePayload;
  /** Non-secret metadata headers only. */
  readonly headers: Readonly<Record<string, string>>;
  readonly streaming: boolean;
  readonly timeoutMs: number;
  readonly compression: CompressionAlgorithm;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CanonicalProviderResponse {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly protocol: TransportProtocol;
  readonly success: boolean;
  /** Opaque provider-shaped response payload. */
  readonly payload: ProviderWirePayload;
  readonly headers: Readonly<Record<string, string>>;
  readonly statusHint?: number;
  readonly streamed: boolean;
  readonly error?: TransportError;
  readonly statistics: TransportStatistics;
  readonly completedAt: string;
}
