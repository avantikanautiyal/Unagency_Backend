/**
 * Middleware, dispatcher, pipeline, engine, and diagnostics ports.
 *
 * Purpose: Compose the transport execution path + expose the public engine.
 * Responsibilities: onion middleware; protocol dispatch; end-to-end pipeline.
 * Usage: The engine is the public entry point; the rest are internal seams.
 * Future Extension: Per-stage hooks, streaming pipeline.
 */

import type { Result } from "../../../shared/result";
import type { CanonicalProviderRequest, CanonicalProviderResponse } from "../contracts/canonical";
import type { TransportContext } from "../contracts/context";
import type { TransportProtocol } from "../contracts/enums";
import type {
  TransportCapability,
  TransportHealth,
  TransportResult,
} from "../contracts/health-result";
import type { TransportSession } from "../contracts/session-connection";
import type { TransportStatistics } from "../contracts/errors";
import type {
  TransportRequest,
  TransportResponse,
} from "../contracts/transport-io";

export type TransportInvoke = (
  request: TransportRequest
) => Promise<Result<TransportResponse>>;

export interface ITransportMiddleware {
  readonly name: string;
  handle(
    request: TransportRequest,
    context: TransportContext,
    next: TransportInvoke
  ): Promise<Result<TransportResponse>>;
}

export interface DispatchOutcome {
  readonly response: TransportResponse;
  readonly attempts: number;
  readonly retries: number;
}

export interface ITransportDispatcher {
  dispatch(
    request: TransportRequest,
    context: TransportContext
  ): Promise<Result<DispatchOutcome>>;
}

export interface PipelineOutcome {
  readonly response: CanonicalProviderResponse;
  readonly session: TransportSession;
  readonly statistics: TransportStatistics;
}

export interface ITransportPipeline {
  run(
    request: CanonicalProviderRequest,
    context: TransportContext
  ): Promise<Result<PipelineOutcome>>;
}

export interface IProviderTransportEngine {
  execute(request: CanonicalProviderRequest): Promise<Result<TransportResult>>;
  capability(protocol: TransportProtocol): Result<TransportCapability>;
  health(protocol: TransportProtocol): TransportHealth;
}

export interface ITransportEventPublisher {
  publishResult(result: TransportResult): Promise<void>;
}
