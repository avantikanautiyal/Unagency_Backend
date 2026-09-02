/**
 * Provider execution request builder.
 *
 * Purpose: Ergonomically construct immutable ProviderExecutionRequest objects.
 * Responsibilities: Apply sensible defaults; produce a frozen request.
 * Usage: Callers (future orchestrator / M4 planning bridge) build requests.
 * Future Extension: Derive requests directly from an ExecutionPlan.
 */

import type {
  CapabilityId,
  ProviderId,
} from "../../../core/identifiers";
import type {
  ProviderExecutionContext,
  ProviderExecutionRequest,
} from "../contracts/provider-execution-request";
import { NO_RETRY_POLICY, type RetryPolicy } from "../contracts/retry-policy";
import {
  DEFAULT_TIMEOUT_POLICY,
  type TimeoutPolicy,
} from "../contracts/timeout-policy";

export class ProviderExecutionRequestBuilder {
  private _requestId?: string;
  private _context?: ProviderExecutionContext;
  private _capabilityId?: CapabilityId;
  private _providerId?: ProviderId;
  private _modelId?: string;
  private _payload: Record<string, unknown> = {};
  private _options?: Record<string, unknown>;
  private _retryPolicy: RetryPolicy = NO_RETRY_POLICY;
  private _timeoutPolicy: TimeoutPolicy = DEFAULT_TIMEOUT_POLICY;
  private _streaming = false;
  private _priority = 0;
  private _metadata?: Record<string, unknown>;

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  withRequestId(requestId: string): this {
    this._requestId = requestId;
    return this;
  }

  withContext(context: ProviderExecutionContext): this {
    this._context = context;
    this._providerId = this._providerId ?? context.providerId;
    return this;
  }

  withCapability(capabilityId: CapabilityId): this {
    this._capabilityId = capabilityId;
    return this;
  }

  withProvider(providerId: ProviderId, modelId?: string): this {
    this._providerId = providerId;
    this._modelId = modelId;
    return this;
  }

  withPayload(payload: Readonly<Record<string, unknown>>): this {
    this._payload = { ...payload };
    return this;
  }

  withOptions(options: Readonly<Record<string, unknown>>): this {
    this._options = { ...options };
    return this;
  }

  withRetryPolicy(policy: RetryPolicy): this {
    this._retryPolicy = policy;
    return this;
  }

  withTimeoutPolicy(policy: TimeoutPolicy): this {
    this._timeoutPolicy = policy;
    return this;
  }

  withStreaming(streaming: boolean): this {
    this._streaming = streaming;
    return this;
  }

  withPriority(priority: number): this {
    this._priority = priority;
    return this;
  }

  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this._metadata = { ...metadata };
    return this;
  }

  build(): ProviderExecutionRequest {
    if (!this._context) {
      throw new Error("ProviderExecutionRequest requires a context");
    }
    if (!this._capabilityId) {
      throw new Error("ProviderExecutionRequest requires a capabilityId");
    }
    const providerId = this._providerId ?? this._context.providerId;
    const requestId = this._requestId ?? `preq_${this.nowIso()}`;

    return Object.freeze({
      requestId,
      context: this._context,
      capabilityId: this._capabilityId,
      providerId,
      modelId: this._modelId,
      payload: Object.freeze({ ...this._payload }),
      options: this._options ? Object.freeze({ ...this._options }) : undefined,
      retryPolicy: this._retryPolicy,
      timeoutPolicy: this._timeoutPolicy,
      streaming: this._streaming,
      priority: this._priority,
      createdAt: this.nowIso(),
      metadata: this._metadata
        ? Object.freeze({ ...this._metadata })
        : undefined,
    });
  }
}
