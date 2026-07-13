/**
 * Provider runtime testing utilities.
 *
 * Purpose: Deterministic fixtures and a controllable dispatcher for tests.
 * Responsibilities: Build requests; simulate dispatch outcomes without SDKs.
 * Usage: Imported by unit tests only.
 * Future Extension: Fault-injection scenarios for adapter conformance tests.
 *
 * The controllable dispatcher performs NO network or SDK calls.
 */

import { ProviderError } from "../../../shared/errors";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { CancellationToken } from "../contracts/cancellation";
import type {
  ProviderExecutionContext,
  ProviderExecutionRequest,
} from "../contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type { RetryPolicy } from "../contracts/retry-policy";
import type { StreamingChunk } from "../contracts/streaming";
import type { TimeoutPolicy } from "../contracts/timeout-policy";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../interfaces/provider-dispatcher";

export type DispatcherMode = "success" | "fail" | "hang";

export interface ControllableDispatcherOptions {
  readonly mode?: DispatcherMode;
  readonly streamingSupported?: boolean;
  /** Fail this many attempts before succeeding (transient failures). */
  readonly failuresBeforeSuccess?: number;
  readonly streamingChunks?: number;
  readonly nowIso?: () => string;
}

export class ControllableDispatcher implements IProviderDispatcher {
  mode: DispatcherMode;
  streamingSupported: boolean;
  failuresBeforeSuccess: number;
  private readonly streamingChunks: number;
  private readonly nowIso: () => string;
  private _attempts = 0;
  private readonly pending: Array<
    (result: Result<ProviderExecutionResponse>) => void
  > = [];

  constructor(options: ControllableDispatcherOptions = {}) {
    this.mode = options.mode ?? "success";
    this.streamingSupported = options.streamingSupported ?? true;
    this.failuresBeforeSuccess = options.failuresBeforeSuccess ?? 0;
    this.streamingChunks = Math.max(1, options.streamingChunks ?? 2);
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  get attempts(): number {
    return this._attempts;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    this._attempts += 1;

    if (this.mode === "hang") {
      return new Promise((resolve) => {
        this.pending.push(resolve);
      });
    }

    if (this.mode === "fail") {
      return failure(new ProviderError("dispatch failed", { requestId: request.requestId }));
    }

    if (this._attempts <= this.failuresBeforeSuccess) {
      return failure(
        new ProviderError("transient dispatch failure", {
          attempt: this._attempts,
        })
      );
    }

    return success(this.response(request, false));
  }

  supportsStreaming(): boolean {
    return this.streamingSupported;
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    this._attempts += 1;

    if (this.mode === "hang") {
      return new Promise((resolve) => {
        this.pending.push(resolve);
      });
    }

    if (this.mode === "fail") {
      return failure(new ProviderError("stream failed"));
    }

    for (let i = 0; i < this.streamingChunks; i += 1) {
      if (token.cancelled) {
        break;
      }
      const chunk: StreamingChunk = {
        sessionId: request.requestId,
        requestId: request.requestId,
        sequence: i,
        data: { index: i },
        done: i === this.streamingChunks - 1,
        receivedAt: this.nowIso(),
      };
      onChunk(chunk);
    }
    return success(this.response(request, true));
  }

  /** Resolve any hung dispatches (test cleanup). */
  settle(result?: Result<ProviderExecutionResponse>): void {
    const value = result;
    for (const resolve of this.pending) {
      resolve(
        value ??
          success({
            requestId: "hung",
            providerId: asProviderId("provider-a"),
            output: {},
            streamed: false,
            finishedAt: this.nowIso(),
          })
      );
    }
    this.pending.length = 0;
  }

  private response(
    request: ProviderExecutionRequest,
    streamed: boolean
  ): ProviderExecutionResponse {
    return {
      requestId: request.requestId,
      providerId: request.providerId,
      output: { ok: true, capabilityId: String(request.capabilityId) },
      usage: { tokens: 0 },
      providerRequestId: `ctrl_${request.requestId}`,
      streamed,
      finishedAt: this.nowIso(),
    };
  }
}

export function sampleExecutionContext(
  overrides: Partial<ProviderExecutionContext> = {}
): ProviderExecutionContext {
  return {
    executionId: asExecutionId("exec_1"),
    organizationId: asOrganizationId("org_1"),
    workspaceId: asWorkspaceId("ws_1"),
    providerId: asProviderId("provider-a"),
    planId: "plan_1",
    correlationId: "corr_1",
    ...overrides,
  };
}

export interface SampleRequestOverrides {
  readonly requestId?: string;
  readonly streaming?: boolean;
  readonly priority?: number;
  readonly retryPolicy?: RetryPolicy;
  readonly timeoutPolicy?: TimeoutPolicy;
  readonly providerId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

let requestCounter = 0;

export function sampleRequest(
  overrides: SampleRequestOverrides = {}
): ProviderExecutionRequest {
  requestCounter += 1;
  const providerId = asProviderId(overrides.providerId ?? "provider-a");
  return {
    requestId: overrides.requestId ?? `preq_${requestCounter}`,
    context: sampleExecutionContext({ providerId }),
    capabilityId: asCapabilityId("analyzeBrief"),
    providerId,
    modelId: "model-x",
    payload: overrides.payload ?? { prompt: "hello" },
    retryPolicy:
      overrides.retryPolicy ?? { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
    timeoutPolicy: overrides.timeoutPolicy ?? { executionTimeoutMs: 1_000 },
    streaming: overrides.streaming ?? false,
    priority: overrides.priority ?? 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
