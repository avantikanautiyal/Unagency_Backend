/**
 * OpenAI SDK client — real IOpenAISdk implementation in the openai leaf.
 * Does NOT modify frozen sdk/openai placeholder wrapper.
 */

import { failure, success, type Result } from "../../../shared/result";
import { asProviderId } from "../../../shared/identifiers";
import type { IOpenAISdk } from "../../sdk/interfaces/client";
import type { SdkAuthentication } from "../../sdk/contracts/authentication";
import type { SdkClientDescriptor } from "../../sdk/contracts/descriptors";
import type { SdkExecutionContext } from "../../sdk/contracts/context";
import type { SdkHealth, SdkStreamingChunk } from "../../sdk/contracts/health-result";
import type { SdkRequest, SdkResponse } from "../../sdk/contracts/request-response";
import { asSdkClientId, asSdkExecutionId } from "../../sdk/contracts/identifiers";
import { parseSdkVersion } from "../../sdk/contracts/version";
import { capabilityForVendor } from "../../sdk/common/capability-catalog";
import type { IOpenAIHttpClient } from "./openai-http-client";
import { toSdkAuthentication } from "../authentication/openai-auth";
import type { OpenAIAuthenticationConfig } from "../contracts/openai-contracts";
import {
  OPENAI_PROVIDER_ID,
  OPENAI_PROVIDER_VERSION,
  OPENAI_SDK_CLIENT_ID,
  OPENAI_VENDOR,
} from "../constants";

export class OpenAISdkClient implements IOpenAISdk {
  readonly vendor = OPENAI_VENDOR as "openai";
  private configured = false;
  private authConfig: OpenAIAuthenticationConfig;

  constructor(
    private readonly http: IOpenAIHttpClient,
    auth: OpenAIAuthenticationConfig = {},
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {
    this.authConfig = auth;
    this.configured = true;
  }

  describe(): SdkClientDescriptor {
    return {
      clientId: asSdkClientId(OPENAI_SDK_CLIENT_ID),
      vendor: this.vendor,
      version: parseSdkVersion(OPENAI_PROVIDER_VERSION)!,
      capability: capabilityForVendor("openai"),
      models: [],
      metadata: { referenceImplementation: true },
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
    const operation = String(request.payload.operation ?? "");
    const audioAsset = body._audioAsset as Record<string, unknown> | undefined;
    const multipart =
      operation === "audio.transcriptions" && audioAsset
        ? {
            fieldName: "file",
            filename:
              typeof audioAsset.filename === "string"
                ? audioAsset.filename
                : "audio.m4a",
            contentType:
              typeof audioAsset.mimeType === "string"
                ? audioAsset.mimeType
                : "audio/mpeg",
            data: resolveAudioBytes(audioAsset),
          }
        : undefined;

    const httpResult = await this.http.send({
      method: "POST",
      path,
      body,
      multipart,
      stream: request.streaming,
      timeoutMs: request.timeoutPolicy?.requestTimeoutMs,
      expectBinary: operation === "audio.speech" || path.includes("/audio/speech"),
    });

    if (!httpResult.ok) {
      return failure(httpResult.error);
    }

    const latencyMs = httpResult.value.latencyMs || this.clockMs() - start;
    const payload = {
      ...httpResult.value.body,
      operation: operation || httpResult.value.body.operation,
    };
    return success({
      requestId: request.requestId,
      providerId: asProviderId(OPENAI_PROVIDER_ID),
      vendor: this.vendor,
      success: true,
      payload,
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
      details: { leaf: "providers/openai" },
    });
  }

  async authenticate(auth: SdkAuthentication): Promise<Result<void>> {
    this.authConfig = {
      ...this.authConfig,
      credentialRef: auth.credentialRef,
      organizationId: auth.metadata?.organizationId
        ? String(auth.metadata.organizationId)
        : this.authConfig.organizationId,
      projectId: auth.metadata?.projectId
        ? String(auth.metadata.projectId)
        : this.authConfig.projectId,
    };
    this.configured = true;
    return success(undefined);
  }

  async shutdown(): Promise<Result<void>> {
    this.configured = false;
    return success(undefined);
  }

  getAuthConfig(): OpenAIAuthenticationConfig {
    return this.authConfig;
  }

  asSdkAuth(): SdkAuthentication {
    return toSdkAuthentication(this.authConfig);
  }
}

/** Decode STT audio bytes from Intelligence input asset (data URL / base64). */
function resolveAudioBytes(audioAsset: Record<string, unknown>): Buffer {
  const url = typeof audioAsset.url === "string" ? audioAsset.url : "";
  if (url.startsWith("data:") && url.includes(";base64,")) {
    const b64 = url.split(";base64,", 2)[1] ?? "";
    if (b64) return Buffer.from(b64, "base64");
  }
  if (typeof audioAsset.data === "string" && audioAsset.data.trim()) {
    const raw = audioAsset.data.trim();
    if (raw.startsWith("data:") && raw.includes(";base64,")) {
      return Buffer.from(raw.split(";base64,", 2)[1] ?? "", "base64");
    }
    return Buffer.from(raw, "base64");
  }
  if (Buffer.isBuffer(audioAsset.data)) {
    return audioAsset.data as Buffer;
  }
  // Simulated / missing bytes — dispatcher still exercises multipart path.
  return Buffer.from("simulated-audio-bytes");
}
