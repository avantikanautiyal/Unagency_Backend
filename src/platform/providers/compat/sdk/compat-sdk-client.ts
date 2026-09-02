/**
 * OpenAI-compatible SDK client for compat text providers.
 * SDK retries disabled — ExecutionPipeline owns retry policy.
 */

import { failure, success, type Result } from "../../../core/result";
import { asProviderId } from "../../../core/identifiers";
import type { SdkAuthentication } from "../../sdk/contracts/authentication";
import type { SdkClientDescriptor } from "../../sdk/contracts/descriptors";
import type { SdkExecutionContext } from "../../sdk/contracts/context";
import type { SdkHealth, SdkStreamingChunk } from "../../sdk/contracts/health-result";
import type { SdkRequest, SdkResponse } from "../../sdk/contracts/request-response";
import { asSdkClientId, asSdkExecutionId } from "../../sdk/contracts/identifiers";
import { parseSdkVersion } from "../../sdk/contracts/version";
import { capabilityForVendor } from "../../sdk/common/capability-catalog";
import type { TextProviderAuthConfig, TextProviderConfig } from "../contracts/text-provider-config";
import type { ICompatHttpClient } from "../http/compat-http-client";

export class CompatSdkClient {
  readonly vendor: TextProviderConfig["vendor"];
  private configured = false;

  constructor(
    private readonly config: TextProviderConfig,
    private readonly http: ICompatHttpClient,
    private authConfig: TextProviderAuthConfig = {},
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {
    this.vendor = config.vendor;
    this.configured = Boolean(authConfig.apiKey?.trim()) || true;
  }

  describe(): SdkClientDescriptor {
    return {
      clientId: asSdkClientId(this.config.sdkClientId),
      vendor: this.vendor,
      version: parseSdkVersion(this.config.version)!,
      capability: capabilityForVendor(this.vendor),
      models: [...this.config.seedWireModels],
      metadata: { protocol: "openai_compatible", leaf: `providers/compat/${this.vendor}` },
    };
  }

  async execute(
    request: SdkRequest,
    _context: SdkExecutionContext
  ): Promise<Result<SdkResponse>> {
    const start = this.clockMs();
    const path = String(request.payload.path ?? "/chat/completions");
    const body = (request.payload.body as Record<string, unknown>) ?? {
      ...request.payload,
    };

    const httpResult = await this.http.send({
      method: "POST",
      path,
      body,
      stream: request.streaming,
      timeoutMs: request.timeoutPolicy?.requestTimeoutMs,
    });

    if (!httpResult.ok) return failure(httpResult.error);

    const latencyMs = httpResult.value.latencyMs || this.clockMs() - start;
    return success({
      requestId: request.requestId,
      providerId: asProviderId(this.config.canonicalProviderId),
      vendor: this.vendor,
      success: true,
      payload: httpResult.value.body,
      headers: httpResult.value.headers,
      statusHint: httpResult.value.status,
      streamed: request.streaming,
      statistics: {
        vendor: this.vendor,
        attempts: 1,
        retries: 0,
        latencyMs,
        streamed: request.streaming,
      },
      completedAt: this.nowIso(),
    });
  }

  async stream(
    request: SdkRequest,
    context: SdkExecutionContext
  ): Promise<Result<AsyncIterable<SdkStreamingChunk>>> {
    const executed = await this.execute({ ...request, streaming: true }, context);
    if (!executed.ok) return executed;

    const executionId = asSdkExecutionId(`stream_${request.requestId}`);
    const chunk: SdkStreamingChunk = {
      executionId,
      requestId: request.requestId,
      sequence: 0,
      kind: "delta",
      data: executed.value.payload,
      done: true,
      receivedAt: this.nowIso(),
    };

    async function* gen() {
      yield chunk;
    }

    return success(gen());
  }

  health(): Result<SdkHealth> {
    return success({
      vendor: this.vendor,
      state: this.configured ? "healthy" : "unconfigured",
      configured: this.configured,
      registered: true,
      checkedAt: this.nowIso(),
      details: { leaf: `providers/compat/${this.vendor}` },
    });
  }

  async authenticate(auth: SdkAuthentication): Promise<Result<void>> {
    this.authConfig = {
      ...this.authConfig,
      apiKey: auth.credentialRef ?? this.authConfig.apiKey,
    };
    this.configured = true;
    return success(undefined);
  }

  async shutdown(): Promise<Result<void>> {
    this.configured = false;
    return success(undefined);
  }

  asSdkAuth(): SdkAuthentication {
    return {
      kind: "api_key",
      credentialRef: this.authConfig.apiKey,
      metadata: {},
    };
  }
}
