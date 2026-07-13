/**
 * Provider transport engine (platform facade).
 *
 * Purpose: The single public entry point for transporting a canonical request.
 * Responsibilities: create context/session id → run pipeline → build canonical
 *   TransportResult → publish. Never contains provider logic or networking.
 * Usage: Every future provider adapter talks ONLY to this engine.
 * Future Extension: Streaming execute(), batched execute().
 */

import type { IntelligenceError } from "../../../shared/errors";
import { success, type Result } from "../../../shared/result";
import type { CanonicalProviderRequest } from "../contracts/canonical";
import type { TransportContext } from "../contracts/context";
import type { TransportProtocol, TransportErrorKind } from "../contracts/enums";
import { asTransportSessionId } from "../contracts/identifiers";
import type { TransportError, TransportStatistics } from "../contracts/errors";
import type {
  TransportCapability,
  TransportHealth,
  TransportResult,
} from "../contracts/health-result";
import type {
  IProviderTransportEngine,
  ITransportEventPublisher,
  ITransportPipeline,
} from "../interfaces/engine";
import type { ITransportHealthMonitor } from "../interfaces/engines";
import { capabilityForProtocol } from "../protocols/protocol-catalog";

const ERROR_KIND_MAP: Readonly<Record<string, TransportErrorKind>> = {
  TIMEOUT_ERROR: "timeout",
  RATE_LIMIT_ERROR: "unavailable",
  NOT_FOUND: "protocol",
  NOT_IMPLEMENTED: "unavailable",
  PROVIDER_ERROR: "connection",
  VALIDATION_ERROR: "serialization",
};

const RETRYABLE_KINDS = new Set<TransportErrorKind>([
  "timeout",
  "unavailable",
  "connection",
]);

export interface TransportEngineDeps {
  readonly pipeline: ITransportPipeline;
  readonly healthMonitor: ITransportHealthMonitor;
  readonly eventPublisher?: ITransportEventPublisher;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class ProviderTransportEngine implements IProviderTransportEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: TransportEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  async execute(
    request: CanonicalProviderRequest
  ): Promise<Result<TransportResult>> {
    const sessionId = asTransportSessionId(this.createId("txsess"));
    const context: TransportContext = {
      requestId: request.requestId,
      providerId: request.providerId,
      protocol: request.protocol,
      sessionId,
      attributes: {},
      startedAt: this.nowIso(),
    };

    const outcome = await this.deps.pipeline.run(request, context);
    const completedAt = this.nowIso();

    let result: TransportResult;
    if (outcome.ok) {
      result = {
        requestId: request.requestId,
        providerId: request.providerId,
        sessionId,
        success: true,
        response: outcome.value.response,
        statistics: outcome.value.statistics,
        completedAt,
      };
    } else {
      result = {
        requestId: request.requestId,
        providerId: request.providerId,
        sessionId,
        success: false,
        error: this.mapError(outcome.error, request.protocol),
        statistics: this.baselineStats(request.protocol),
        completedAt,
      };
    }

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishResult(result);
    }
    return success(result);
  }

  capability(protocol: TransportProtocol): Result<TransportCapability> {
    return success(capabilityForProtocol(protocol));
  }

  health(protocol: TransportProtocol): TransportHealth {
    return this.deps.healthMonitor.protocolHealth(protocol);
  }

  private mapError(
    error: IntelligenceError,
    protocol: TransportProtocol
  ): TransportError {
    const kind = ERROR_KIND_MAP[error.code] ?? "unknown";
    return {
      kind,
      code: error.code,
      message: error.message,
      retryable: RETRYABLE_KINDS.has(kind),
      protocol,
      details: error.metadata,
    };
  }

  private baselineStats(protocol: TransportProtocol): TransportStatistics {
    return { protocol, attempts: 1, retries: 0 };
  }
}
