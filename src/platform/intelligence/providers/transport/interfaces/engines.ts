/**
 * Streaming, retry, timeout, and health ports.
 *
 * Purpose: Cross-cutting transport concerns as injectable engines.
 * Responsibilities: chunk normalization; transport-only retry/timeout; health.
 * Usage: Injected into the dispatcher/pipeline/engine.
 * Future Extension: Backpressure, jittered retry, adaptive timeouts.
 */

import type { IntelligenceError } from "../../../shared/errors";
import type { Result } from "../../../shared/result";
import type { TransportProtocol } from "../contracts/enums";
import type { ConnectionId, PoolId } from "../contracts/identifiers";
import type { TransportHealth } from "../contracts/health-result";
import type { TransportSession } from "../contracts/session-connection";
import type {
  StreamingTransportChunk,
  TransportResponse,
} from "../contracts/transport-io";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";

export interface ITransportStreamingEngine {
  normalizeChunk(
    raw: ProviderWirePayload,
    session: TransportSession,
    sequence: number
  ): Result<StreamingTransportChunk>;
  heartbeat(session: TransportSession, sequence: number): Result<StreamingTransportChunk>;
  complete(session: TransportSession, sequence: number): Result<StreamingTransportChunk>;
  cancel(session: TransportSession, sequence: number): Result<StreamingTransportChunk>;
}

export type TransportRetryStrategy = "none" | "fixed" | "exponential";

export interface TransportRetryPolicy {
  readonly strategy: TransportRetryStrategy;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs?: number;
}

export interface RetryOutcome<T> {
  readonly result: Result<T>;
  readonly attempts: number;
  readonly retries: number;
}

export interface ITransportRetryEngine {
  execute<T>(
    operation: (attempt: number) => Promise<Result<T>>,
    policy: TransportRetryPolicy,
    isRetryable: (error: IntelligenceError) => boolean
  ): Promise<RetryOutcome<T>>;
}

export interface ITransportTimeoutEngine {
  run<T>(
    operation: () => Promise<Result<T>>,
    timeoutMs: number
  ): Promise<Result<T>>;
}

export interface ITransportHealthMonitor {
  record(protocol: TransportProtocol, ok: boolean, latencyMs?: number): void;
  protocolHealth(protocol: TransportProtocol): TransportHealth;
  connectionHealthy(connectionId?: ConnectionId): boolean;
  poolHealthy(poolId?: PoolId): boolean;
}

/** A pluggable transport client response used by the retry/timeout wrapper. */
export type TransportSendResult = Result<TransportResponse>;
