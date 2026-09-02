/**
 * Anthropic SDK client — Messages API leaf transport.
 */

import { failure, success, type Result } from "../../../core/result";
import { asProviderId } from "../../../core/identifiers";
import type { SdkAuthentication } from "../../sdk/contracts/authentication";
import type { SdkClientDescriptor } from "../../sdk/contracts/descriptors";
import type { SdkExecutionContext } from "../../sdk/contracts/context";
import type { SdkHealth } from "../../sdk/contracts/health-result";
import type { SdkRequest, SdkResponse } from "../../sdk/contracts/request-response";
import { asSdkClientId } from "../../sdk/contracts/identifiers";
import { parseSdkVersion } from "../../sdk/contracts/version";
import { capabilityForVendor } from "../../sdk/common/capability-catalog";
import type { IAnthropicHttpClient, AnthropicAuthConfig } from "../http/anthropic-http-client";
import {
  ANTHROPIC_PROVIDER_ID,
  ANTHROPIC_SDK_CLIENT_ID,
  ANTHROPIC_PROVIDER_VERSION,
  ANTHROPIC_VENDOR,
} from "../constants";

export class AnthropicSdkClient {
  readonly vendor = ANTHROPIC_VENDOR;
  private configured = false;

  constructor(
    private readonly http: IAnthropicHttpClient,
    private authConfig: AnthropicAuthConfig = {},
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {
    this.configured = true;
  }

  describe(): SdkClientDescriptor {
    return {
      clientId: asSdkClientId(ANTHROPIC_SDK_CLIENT_ID),
      vendor: this.vendor,
      version: parseSdkVersion(ANTHROPIC_PROVIDER_VERSION)!,
      capability: capabilityForVendor("anthropic"),
      models: [],
      metadata: { leaf: "providers/anthropic" },
    };
  }

  async execute(
    request: SdkRequest,
    _context: SdkExecutionContext
  ): Promise<Result<SdkResponse>> {
    const start = this.clockMs();
    const path = String(request.payload.path ?? "/v1/messages");
    const body = (request.payload.body as Record<string, unknown>) ?? request.payload;

    const httpResult = await this.http.send({
      method: "POST",
      path,
      body,
      timeoutMs: request.timeoutPolicy?.requestTimeoutMs,
    });

    if (!httpResult.ok) return failure(httpResult.error);

    return success({
      requestId: request.requestId,
      providerId: asProviderId(ANTHROPIC_PROVIDER_ID),
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
        latencyMs: httpResult.value.latencyMs || this.clockMs() - start,
        streamed: request.streaming,
      },
      completedAt: this.nowIso(),
    });
  }

  health(): Result<SdkHealth> {
    return success({
      vendor: this.vendor,
      state: this.configured ? "healthy" : "unconfigured",
      configured: this.configured,
      registered: true,
      checkedAt: this.nowIso(),
      details: { leaf: "providers/anthropic" },
    });
  }

  async authenticate(auth: SdkAuthentication): Promise<Result<void>> {
    this.authConfig = { ...this.authConfig, apiKey: auth.credentialRef };
    this.configured = true;
    return success(undefined);
  }

  async shutdown(): Promise<Result<void>> {
    this.configured = false;
    return success(undefined);
  }

  asSdkAuth(): SdkAuthentication {
    return { kind: "api_key", credentialRef: this.authConfig.apiKey, metadata: {} };
  }
}
