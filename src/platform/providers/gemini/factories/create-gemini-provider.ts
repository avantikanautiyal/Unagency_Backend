/**
 * Gemini provider leaf — adapter, SDK, dispatcher, factory.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import { asProviderId } from "../../../core/identifiers";
import type { ProviderId } from "../../../core/identifiers";
import { AbstractTextProviderAdapter } from "../../adapters/base/specialized-adapters";
import type { ProviderAdapterMetadata } from "../../adapters/contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderAdapterResponse,
  ProviderWirePayload,
} from "../../adapters/contracts/adapter-io";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import { buildTextProviderManifest } from "../../common/build-text-provider-manifest";
import type {
  ProviderTranslationResult,
  ProviderValidationResult,
} from "../../adapters/contracts/results";
import { asProviderAdapterId } from "../../adapters/contracts/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { SdkAuthentication } from "../../sdk/contracts/authentication";
import type { SdkClientDescriptor } from "../../sdk/contracts/descriptors";
import type { SdkExecutionContext } from "../../sdk/contracts/context";
import type { SdkHealth } from "../../sdk/contracts/health-result";
import type { SdkRequest, SdkResponse } from "../../sdk/contracts/request-response";
import { asSdkClientId, asSdkExecutionId } from "../../sdk/contracts/identifiers";
import { parseSdkVersion } from "../../sdk/contracts/version";
import { capabilityForVendor } from "../../sdk/common/capability-catalog";
import {
  FetchGeminiHttpClient,
  SimulatedGeminiHttpClient,
  type GeminiAuthConfig,
  type IGeminiHttpClient,
} from "../http/gemini-http-client";
import {
  GEMINI_ADAPTER_ID,
  GEMINI_PROVIDER_ID,
  GEMINI_PROVIDER_VERSION,
  GEMINI_SEED_MODELS,
  GEMINI_VISION_MODELS,
  GEMINI_VENDOR,
  GEMINI_SDK_CLIENT_ID,
} from "../constants";
import { mapToGeminiVisionParts } from "../../common/vision-content";
import { isVisionCapability } from "../../common/resolve-execution-modality";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";
import {
  extractInputAssets,
  validateInputAssetTenancy,
} from "../../common/input-asset-validator";

function canonicalToWire(modelId: string): string {
  if (modelId.includes("/")) {
    const [prefix, ...rest] = modelId.split("/");
    if (prefix === "gemini") return rest.join("/");
    return rest.join("/");
  }
  return modelId;
}

function mapRequest(request: ProviderAdapterRequest, wireModelId: string): ProviderWirePayload {
  const isVision =
    request.features.includes("vision") ||
    request.modality === "multimodal" ||
    isVisionCapability(String(request.capabilityId ?? ""));

  if (isVision) {
    return Object.freeze({
      operation: "generateContent",
      path: `/models/${wireModelId}:generateContent`,
      body: Object.freeze({
        contents: [{ role: "user", parts: mapToGeminiVisionParts(request) }],
      }),
    });
  }

  const messages =
    (request.input.messages as Array<Record<string, unknown>>) ??
    (request.input.prompt
      ? [{ role: "user", content: request.input.prompt }]
      : [{ role: "user", content: JSON.stringify(request.input) }]);

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content ?? ""),
      },
    ],
  }));

  const wantJson =
    request.features.includes("json_mode") ||
    request.features.includes("response_format") ||
    request.features.includes("structured_outputs");

  const params = (request.parameters ?? {}) as Record<string, unknown>;
  const maxOutputTokens =
    typeof params.maxOutputTokens === "number"
      ? params.maxOutputTokens
      : typeof params.maxTokens === "number"
        ? params.maxTokens
        : typeof params.max_tokens === "number"
          ? params.max_tokens
          : undefined;

  const generationConfig: Record<string, unknown> = {};
  if (wantJson) generationConfig.responseMimeType = "application/json";
  if (typeof maxOutputTokens === "number" && maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = Math.min(Math.floor(maxOutputTokens), 8192);
  }

  return Object.freeze({
    operation: "generateContent",
    path: `/models/${wireModelId}:generateContent`,
    body: Object.freeze({
      contents,
      ...(Object.keys(generationConfig).length
        ? { generationConfig: Object.freeze(generationConfig) }
        : {}),
    }),
  });
}

function mapResponse(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const candidates = raw.candidates as Array<Record<string, unknown>> | undefined;
  const content = (candidates?.[0]?.content as Record<string, unknown>) ?? {};
  const parts = content.parts as Array<Record<string, unknown>> | undefined;
  const text = parts?.map((p) => String(p.text ?? "")).join("") ?? "";
  const usage = (raw.usageMetadata as Record<string, unknown>) ?? {};
  const rawFinish = String(candidates?.[0]?.finishReason ?? "STOP").toUpperCase();
  const finishReason =
    rawFinish === "MAX_TOKENS" || rawFinish === "LENGTH" ? "length" : "stop";

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    modelId: request.modelId,
    output: Object.freeze({ content: text }),
    finishReason,
    usage: Object.freeze({
      promptTokens: typeof usage.promptTokenCount === "number" ? usage.promptTokenCount : undefined,
      completionTokens:
        typeof usage.candidatesTokenCount === "number" ? usage.candidatesTokenCount : undefined,
      totalTokens: typeof usage.totalTokenCount === "number" ? usage.totalTokenCount : undefined,
    }),
    latencyMs,
    warnings: [],
    safety: [],
    streamed: Boolean(request.streaming),
    createdAt: nowIso,
  });
}

class GeminiAdapter extends AbstractTextProviderAdapter {
  constructor(manifest: ProviderManifest, nowIso: () => string) {
    const metadata: ProviderAdapterMetadata = {
      adapterId: asProviderAdapterId(GEMINI_ADAPTER_ID),
      providerId: asProviderId(GEMINI_PROVIDER_ID),
      vendor: GEMINI_VENDOR,
      category: "text",
      version: GEMINI_PROVIDER_VERSION,
      description: "Google Gemini text provider adapter",
      tags: ["gemini", "text"],
    };
    super(metadata, manifest, { nowIso });
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    const wire = canonicalToWire(request.modelId);
    if (!GEMINI_SEED_MODELS.includes(wire as (typeof GEMINI_SEED_MODELS)[number])) {
      return failure(new ValidationError(`Model '${request.modelId}' not available for Gemini`));
    }
    if (
      isVisionCapability(String(request.capabilityId)) &&
      !GEMINI_VISION_MODELS.includes(wire as (typeof GEMINI_VISION_MODELS)[number])
    ) {
      return failure(new ValidationError(`Model '${request.modelId}' does not support vision.analyze`));
    }
    return success({
      value: { ...mapRequest(request, wire), resolvedModelId: wire },
      warnings: [],
      droppedFields: [],
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wire = canonicalToWire(request.modelId);
    if (!GEMINI_SEED_MODELS.includes(wire as (typeof GEMINI_SEED_MODELS)[number])) {
      return success({
        valid: false,
        issues: [{ code: "model_not_found", message: `Unknown Gemini model ${request.modelId}`, severity: "error" }],
      });
    }
    return super.validate({ ...request, modelId: wire });
  }
}

class GeminiSdkClient {
  readonly vendor = GEMINI_VENDOR;
  constructor(
    private readonly http: IGeminiHttpClient,
    private authConfig: GeminiAuthConfig = {},
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  describe(): SdkClientDescriptor {
    return {
      clientId: asSdkClientId(GEMINI_SDK_CLIENT_ID),
      vendor: this.vendor,
      version: parseSdkVersion(GEMINI_PROVIDER_VERSION)!,
      capability: capabilityForVendor("gemini"),
      models: [],
      metadata: { leaf: "providers/gemini" },
    };
  }

  async execute(request: SdkRequest, _ctx: SdkExecutionContext): Promise<Result<SdkResponse>> {
    const start = this.clockMs();
    const httpResult = await this.http.send({
      method: "POST",
      path: String(request.payload.path),
      body: request.payload.body as Record<string, unknown>,
      timeoutMs: request.timeoutPolicy?.requestTimeoutMs,
    });
    if (!httpResult.ok) return failure(httpResult.error);
    return success({
      requestId: request.requestId,
      providerId: asProviderId(GEMINI_PROVIDER_ID),
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
      state: "healthy",
      configured: true,
      registered: true,
      checkedAt: this.nowIso(),
      details: { leaf: "providers/gemini" },
    });
  }

  async authenticate(auth: SdkAuthentication): Promise<Result<void>> {
    this.authConfig = { ...this.authConfig, apiKey: auth.credentialRef };
    return success(undefined);
  }

  async shutdown(): Promise<Result<void>> {
    return success(undefined);
  }

  asSdkAuth(): SdkAuthentication {
    return { kind: "api_key", credentialRef: this.authConfig.apiKey, metadata: {} };
  }
}

class GeminiDispatcher implements IProviderDispatcher {
  constructor(
    private readonly adapter: GeminiAdapter,
    private readonly sdk: GeminiSdkClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(providerId: ProviderId): boolean {
    return String(providerId) === GEMINI_PROVIDER_ID;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const start = this.clockMs();
    const adapterRequest: ProviderAdapterRequest = toAdapterRequestFromExecution({
      request,
      canonicalProviderId: GEMINI_PROVIDER_ID,
      adapterId: GEMINI_ADAPTER_ID,
      nowIso: this.nowIso(),
    });

    if (isVisionCapability(String(request.capabilityId))) {
      const assets = extractInputAssets(request.payload);
      if (assets.length > 0) {
        const tenancy = validateInputAssetTenancy({
          assets,
          organizationId: String(request.context.organizationId),
          workspaceId: String(request.context.workspaceId),
        });
        if (!tenancy.ok) return tenancy;
      }
    }

    const validation = this.adapter.validate(adapterRequest);
    if (!validation.ok) return validation;
    if (!validation.value.valid) {
      return failure(new ValidationError(validation.value.issues.map((i) => i.message).join("; ")));
    }

    const translated = this.adapter.translateRequest(adapterRequest);
    if (!translated.ok) return translated;

    const sdkResult = await this.sdk.execute(
      {
        requestId: request.requestId,
        providerId: asProviderId(GEMINI_PROVIDER_ID),
        vendor: GEMINI_VENDOR,
        operation: "generateContent",
        payload: translated.value.value,
        streaming: request.streaming,
        authentication: this.sdk.asSdkAuth(),
        headers: {},
        metadata: {},
        createdAt: this.nowIso(),
      },
      {
        executionId: asSdkExecutionId(String(request.context.executionId)),
        requestId: request.requestId,
        providerId: asProviderId(GEMINI_PROVIDER_ID),
        vendor: GEMINI_VENDOR,
        clientId: this.sdk.describe().clientId,
        attributes: {},
        startedAt: this.nowIso(),
      }
    );

    if (!sdkResult.ok) return sdkResult;

    const canonical = mapResponse(
      sdkResult.value.payload,
      adapterRequest,
      sdkResult.value.statistics.latencyMs ?? this.clockMs() - start,
      this.nowIso()
    );

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: canonical.output,
      usage: canonical.usage as Readonly<Record<string, unknown>>,
      providerRequestId: "",
      streamed: request.streaming,
      finishedAt: this.nowIso(),
    });
  }

  async dispatchStreaming(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    onChunk: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    const result = await this.dispatch({ ...request, streaming: true }, token);
    if (result.ok) {
      onChunk({
        sessionId: `sess_${request.requestId}`,
        requestId: request.requestId,
        sequence: 0,
        data: result.value.output,
        done: true,
        receivedAt: this.nowIso(),
      });
    }
    return result;
  }
}

export interface GeminiProviderPlatform {
  readonly mode: "simulated" | "live";
  readonly dispatcher: GeminiDispatcher;
}

export function createGeminiProvider(options: {
  mode?: "simulated" | "live";
  auth?: GeminiAuthConfig;
  httpClient?: IGeminiHttpClient;
  nowIso?: () => string;
  clockMs?: () => number;
} = {}): Result<GeminiProviderPlatform> {
  const mode = options.mode ?? (options.auth?.apiKey ? "live" : "simulated");
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const http =
    options.httpClient ??
    (mode === "live"
      ? new FetchGeminiHttpClient(options.auth ?? {}, clockMs)
      : new SimulatedGeminiHttpClient(clockMs));

  const manifest = buildTextProviderManifest({
    providerId: GEMINI_PROVIDER_ID,
    vendor: GEMINI_VENDOR,
    displayName: "Google Gemini",
    version: GEMINI_PROVIDER_VERSION,
    wireModels: GEMINI_SEED_MODELS,
    visionWireModels: GEMINI_VISION_MODELS,
    capabilities: ["text.generate", "text.chat", "vision.analyze"],
    nowIso: nowIso(),
  });

  const adapter = new GeminiAdapter(manifest, nowIso);
  const sdk = new GeminiSdkClient(http, options.auth ?? {}, nowIso, clockMs);
  const dispatcher = new GeminiDispatcher(adapter, sdk, nowIso, clockMs);

  return success({ mode, dispatcher });
}
