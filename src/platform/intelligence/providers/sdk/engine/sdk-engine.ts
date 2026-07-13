/**
 * Provider SDK engine (platform facade).
 *
 * Purpose: The single public entry point for SDK execution.
 * Responsibilities: resolve wrapper, validate, dispatch with retry/timeout,
 *   normalize response, return SdkExecutionResult. No networking.
 * Usage: Adapters call the engine; engine delegates to wrappers.
 * Future Extension: Streaming execute entry point.
 */

import type { IntelligenceError } from "../../../shared/errors";
import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { SdkVendor, SdkErrorKind } from "../contracts/enums";
import { asSdkExecutionId } from "../contracts/identifiers";
import type { SdkError, SdkStatistics } from "../contracts/errors";
import type { SdkExecutionContext } from "../contracts/context";
import type {
  SdkExecutionResult,
  SdkHealth,
} from "../contracts/health-result";
import type { SdkRequest } from "../contracts/request-response";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkRetryPolicy } from "../contracts/policies";
import type {
  IProviderSdkEngine,
  ISdkEventPublisher,
} from "../interfaces/engine";
import type { ISdkRegistry } from "../interfaces/registry";
import type {
  ISdkAuthenticationProvider,
  ISdkHealthMonitor,
  ISdkRetryEngine,
  ISdkTimeoutEngine,
} from "../interfaces/engines";

const DEFAULT_RETRY: SdkRetryPolicy = {
  strategy: "none",
  maxAttempts: 1,
  baseDelayMs: 0,
};

const ERROR_KIND_MAP: Readonly<Record<string, SdkErrorKind>> = {
  TIMEOUT_ERROR: "timeout",
  RATE_LIMIT_ERROR: "rate_limit",
  NOT_FOUND: "unavailable",
  NOT_IMPLEMENTED: "not_implemented",
  PROVIDER_ERROR: "provider_internal",
  VALIDATION_ERROR: "configuration",
  AUTHORIZATION_ERROR: "authorization",
};

const RETRYABLE_KINDS = new Set<SdkErrorKind>([
  "timeout",
  "rate_limit",
  "unavailable",
  "provider_internal",
]);

export interface SdkEngineDeps {
  readonly registry: ISdkRegistry;
  readonly retryEngine: ISdkRetryEngine;
  readonly timeoutEngine: ISdkTimeoutEngine;
  readonly healthMonitor: ISdkHealthMonitor;
  readonly authProvider?: ISdkAuthenticationProvider;
  readonly eventPublisher?: ISdkEventPublisher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly isRetryable?: (error: IntelligenceError) => boolean;
}

export class ProviderSdkEngine implements IProviderSdkEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly isRetryable: (error: IntelligenceError) => boolean;

  constructor(private readonly deps: SdkEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
    this.isRetryable =
      deps.isRetryable ??
      ((error) =>
        RETRYABLE_KINDS.has(ERROR_KIND_MAP[error.code] ?? "unknown"));
  }

  async execute(request: SdkRequest): Promise<Result<SdkExecutionResult>> {
    const invalid = this.validate(request);
    if (invalid) {
      return failure(invalid);
    }

    if (request.authentication && this.deps.authProvider) {
      const auth = this.deps.authProvider.validate(request.authentication);
      if (!auth.ok) {
        return auth;
      }
    }

    const clientResult = this.deps.registry.resolve(request.vendor);
    if (!clientResult.ok) {
      return clientResult;
    }
    const client = clientResult.value;
    const descriptor = client.describe();

    const executionId = asSdkExecutionId(this.createId("sdkexec"));
    const context: SdkExecutionContext = {
      executionId,
      requestId: request.requestId,
      providerId: request.providerId,
      vendor: request.vendor,
      clientId: descriptor.clientId,
      attributes: {},
      startedAt: this.nowIso(),
    };

    const retryPolicy = request.retryPolicy ?? DEFAULT_RETRY;
    const timeoutMs =
      request.timeoutPolicy?.requestTimeoutMs ?? 30_000;

    const start = this.clockMs();
    const outcome = await this.deps.retryEngine.execute(
      () =>
        this.deps.timeoutEngine.run(
          () => client.execute(request, context),
          timeoutMs
        ),
      retryPolicy,
      this.isRetryable
    );
    const latencyMs = this.clockMs() - start;

    this.deps.healthMonitor.record(request.vendor, outcome.result.ok, latencyMs);
    const completedAt = this.nowIso();

    let result: SdkExecutionResult;
    if (outcome.result.ok) {
      const statistics: SdkStatistics = {
        vendor: request.vendor,
        attempts: outcome.attempts,
        retries: outcome.retries,
        latencyMs,
        streamed: outcome.result.value.streamed,
      };
      result = {
        executionId,
        requestId: request.requestId,
        providerId: request.providerId,
        vendor: request.vendor,
        clientId: descriptor.clientId,
        success: true,
        response: { ...outcome.result.value, statistics },
        statistics,
        completedAt,
      };
    } else {
      const error = this.mapError(outcome.result.error, request.vendor);
      const statistics: SdkStatistics = {
        vendor: request.vendor,
        attempts: outcome.attempts,
        retries: outcome.retries,
        latencyMs,
        streamed: false,
      };
      result = {
        executionId,
        requestId: request.requestId,
        providerId: request.providerId,
        vendor: request.vendor,
        clientId: descriptor.clientId,
        success: false,
        error,
        statistics,
        completedAt,
      };
    }

    if (this.deps.eventPublisher) {
      await this.deps.eventPublisher.publishResult(result);
    }
    return success(result);
  }

  describe(vendor: SdkVendor): Result<SdkClientDescriptor> {
    return this.deps.registry.describe(vendor);
  }

  health(vendor: SdkVendor): SdkHealth {
    return this.deps.healthMonitor.vendorHealth(vendor);
  }

  private validate(request: SdkRequest): ValidationError | undefined {
    if (!request.requestId) {
      return new ValidationError("SDK request requires a requestId");
    }
    if (!request.providerId) {
      return new ValidationError("SDK request requires a providerId");
    }
    if (!request.vendor) {
      return new ValidationError("SDK request requires a vendor");
    }
    if (!request.operation) {
      return new ValidationError("SDK request requires an operation");
    }
    return undefined;
  }

  private mapError(error: IntelligenceError, vendor: SdkVendor): SdkError {
    const kind = ERROR_KIND_MAP[error.code] ?? "unknown";
    return {
      kind,
      code: error.code,
      message: error.message,
      retryable: RETRYABLE_KINDS.has(kind),
      vendor,
      details: error.metadata,
    };
  }
}
