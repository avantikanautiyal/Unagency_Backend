/**
 * Cohere provider leaf — v2 chat API.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
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
  COHERE_ADAPTER_ID,
  COHERE_BASE_URL,
  COHERE_PROVIDER_ID,
  COHERE_PROVIDER_VERSION,
  COHERE_SDK_CLIENT_ID,
  COHERE_SEED_MODELS,
  COHERE_EMBEDDING_MODELS,
  COHERE_VENDOR,
} from "../constants";
import { isEmbeddingCapability } from "../../common/resolve-execution-modality";
import {
  attachEmbeddingOutputs,
  extractEmbeddingInputText,
  mapCohereEmbeddingResponse,
} from "../../common/embedding-output";
import { toAdapterRequestFromExecution } from "../../common/to-adapter-request";

export interface CohereAuthConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface CohereHttpRequest {
  readonly method: "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
}

export interface CohereHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
}

export interface ICohereHttpClient {
  send(request: CohereHttpRequest): Promise<Result<CohereHttpResponse>>;
}

export class FetchCohereHttpClient implements ICohereHttpClient {
  constructor(
    private readonly auth: CohereAuthConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: CohereHttpRequest): Promise<Result<CohereHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(new ValidationError("COHERE_API_KEY required for live HTTP"));
    }
    const base = this.auth.baseUrl ?? COHERE_BASE_URL;
    const url = `${base.replace(/\/$/, "")}${request.path}`;
    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? 60_000);
      const res = await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${this.auth.apiKey}`,
          "Content-Type": "application/json",
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = { raw: text };
      }
      if (!res.ok) {
        return failure(new ProviderError(`Cohere HTTP ${res.status}`, { status: res.status, body }));
      }
      return success({ status: res.status, headers: {}, body, latencyMs: this.clockMs() - start });
    } catch (err) {
      return failure(
        new ProviderError(err instanceof Error ? err.message : "Cohere HTTP failed", { cause: err })
      );
    }
  }
}

export class SimulatedCohereHttpClient implements ICohereHttpClient {
  constructor(
    private readonly clockMs: () => number = () => Date.now(),
    private readonly injectError?: (request: CohereHttpRequest) => ProviderError | undefined
  ) {}

  async send(request: CohereHttpRequest): Promise<Result<CohereHttpResponse>> {
    const start = this.clockMs();
    const injected = this.injectError?.(request);
    if (injected) return failure(injected);
    const model = String(request.body?.model ?? COHERE_SEED_MODELS[0]);
    if (request.path.includes("/embed")) {
      const texts = request.body?.texts as string[] | undefined;
      const dims = 8;
      const vector = Array.from({ length: dims }, (_, i) => (i + 1) * 0.01);
      return success({
        status: 200,
        headers: {},
        body: {
          id: `cohere_embed_sim_${start}`,
          embeddings: { float: [vector] },
          texts: texts ?? [],
          meta: {
            billed_units: { input_tokens: String(texts?.[0] ?? "").length },
          },
        },
        latencyMs: this.clockMs() - start,
      });
    }
    return success({
      status: 200,
      headers: {},
      body: {
        id: `cohere_sim_${start}`,
        message: { role: "assistant", content: [{ type: "text", text: `[simulated:cohere] ${model}` }] },
        finish_reason: "COMPLETE",
        usage: { billed_units: { input_tokens: 9, output_tokens: 18 } },
      },
      latencyMs: this.clockMs() - start,
    });
  }
}

function canonicalToWire(modelId: string): string {
  if (modelId.includes("/")) {
    const [prefix, ...rest] = modelId.split("/");
    if (prefix === "cohere") return rest.join("/");
    return rest.join("/");
  }
  return modelId;
}

function mapRequest(request: ProviderAdapterRequest, wireModelId: string): ProviderWirePayload {
  if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
    const textResult = extractEmbeddingInputText(request.input);
    const text = textResult.ok ? textResult.value : "";
    const inputType =
      typeof request.input.input_type === "string"
        ? request.input.input_type
        : typeof request.parameters.input_type === "string"
          ? request.parameters.input_type
          : "search_document";
    return Object.freeze({
      operation: "embed",
      path: "/embed",
      body: Object.freeze({
        model: wireModelId,
        texts: [text],
        input_type: inputType,
        embedding_types: ["float"],
      }),
    });
  }

  const messages =
    (request.input.messages as Array<Record<string, unknown>>) ??
    [{ role: "user", content: request.input.prompt ?? JSON.stringify(request.input) }];

  return Object.freeze({
    operation: "chat",
    path: "/chat",
    body: Object.freeze({
      model: wireModelId,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    }),
  });
}

function mapResponse(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): Result<ProviderAdapterResponse> {
  if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
    const mapped = mapCohereEmbeddingResponse({
      body: raw,
      model: request.modelId,
      provider: String(request.providerId),
    });
    if (!mapped.ok) return mapped;
    const meta = (raw.meta as Record<string, unknown>) ?? {};
    const billed = (meta.billed_units as Record<string, unknown>) ?? {};
    return success(
      Object.freeze({
        requestId: request.requestId,
        providerId: request.providerId,
        adapterId: request.adapterId,
        modelId: request.modelId,
        output: attachEmbeddingOutputs({}, mapped.value),
        finishReason: "stop" as const,
        usage: Object.freeze({
          promptTokens:
            typeof billed.input_tokens === "number" ? billed.input_tokens : undefined,
          totalTokens:
            typeof billed.input_tokens === "number" ? billed.input_tokens : undefined,
        }),
        latencyMs,
        warnings: [],
        safety: [],
        streamed: false,
        createdAt: nowIso,
      })
    );
  }

  const message = (raw.message as Record<string, unknown>) ?? {};
  const contentParts = message.content as Array<Record<string, unknown>> | undefined;
  const text = contentParts?.map((p) => String(p.text ?? "")).join("") ?? "";
  const usage = (raw.usage as Record<string, unknown>) ?? {};
  const billed = (usage.billed_units as Record<string, unknown>) ?? {};

  return success(
    Object.freeze({
      requestId: request.requestId,
      providerId: request.providerId,
      adapterId: request.adapterId,
      modelId: request.modelId,
      output: Object.freeze({ content: text }),
      finishReason: "stop" as const,
      usage: Object.freeze({
        promptTokens: typeof billed.input_tokens === "number" ? billed.input_tokens : undefined,
        completionTokens: typeof billed.output_tokens === "number" ? billed.output_tokens : undefined,
        totalTokens:
          typeof billed.input_tokens === "number" && typeof billed.output_tokens === "number"
            ? billed.input_tokens + billed.output_tokens
            : undefined,
      }),
      latencyMs,
      warnings: [],
      safety: [],
      streamed: Boolean(request.streaming),
      createdAt: nowIso,
    })
  );
}

class CohereAdapter extends AbstractTextProviderAdapter {
  constructor(manifest: ProviderManifest, nowIso: () => string) {
    const metadata: ProviderAdapterMetadata = {
      adapterId: asProviderAdapterId(COHERE_ADAPTER_ID),
      providerId: asProviderId(COHERE_PROVIDER_ID),
      vendor: COHERE_VENDOR,
      category: "text",
      version: COHERE_PROVIDER_VERSION,
      description: "Cohere v2 chat text provider adapter",
      tags: ["cohere", "text"],
    };
    super(metadata, manifest, { nowIso });
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    const wire = canonicalToWire(request.modelId);
    if (!COHERE_SEED_MODELS.includes(wire as (typeof COHERE_SEED_MODELS)[number])) {
      return failure(new ValidationError(`Model '${request.modelId}' not available for Cohere`));
    }
    if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
      if (!COHERE_EMBEDDING_MODELS.includes(wire as (typeof COHERE_EMBEDDING_MODELS)[number])) {
        return failure(
          new ValidationError(`Model '${request.modelId}' does not support embedding.generate`)
        );
      }
      const text = extractEmbeddingInputText(request.input);
      if (!text.ok) return text;
    }
    return success({
      value: { ...mapRequest(request, wire), resolvedModelId: wire },
      warnings: [],
      droppedFields: [],
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wire = canonicalToWire(request.modelId);
    if (!COHERE_SEED_MODELS.includes(wire as (typeof COHERE_SEED_MODELS)[number])) {
      return success({
        valid: false,
        issues: [{ code: "model_not_found", message: `Unknown Cohere model ${request.modelId}`, severity: "error" }],
      });
    }
    if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
      if (!COHERE_EMBEDDING_MODELS.includes(wire as (typeof COHERE_EMBEDDING_MODELS)[number])) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support embedding.generate`,
              severity: "error",
            },
          ],
        });
      }
      const text = extractEmbeddingInputText(request.input);
      if (!text.ok) {
        return success({
          valid: false,
          issues: [
            {
              code: "invalid_request",
              message: text.error.message,
              severity: "error",
            },
          ],
        });
      }
    }
    return super.validate({ ...request, modelId: wire });
  }
}

class CohereSdkClient {
  readonly vendor = COHERE_VENDOR;
  constructor(
    private readonly http: ICohereHttpClient,
    private authConfig: CohereAuthConfig = {},
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  describe(): SdkClientDescriptor {
    return {
      clientId: asSdkClientId(COHERE_SDK_CLIENT_ID),
      vendor: this.vendor,
      version: parseSdkVersion(COHERE_PROVIDER_VERSION)!,
      capability: capabilityForVendor("cohere"),
      models: [],
      metadata: { leaf: "providers/cohere" },
    };
  }

  async execute(request: SdkRequest, _ctx: SdkExecutionContext): Promise<Result<SdkResponse>> {
    const start = this.clockMs();
    const httpResult = await this.http.send({
      method: "POST",
      path: String(request.payload.path ?? "/chat"),
      body: request.payload.body as Record<string, unknown>,
      timeoutMs: request.timeoutPolicy?.requestTimeoutMs,
    });
    if (!httpResult.ok) return failure(httpResult.error);
    return success({
      requestId: request.requestId,
      providerId: asProviderId(COHERE_PROVIDER_ID),
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
      details: { leaf: "providers/cohere" },
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

class CohereDispatcher implements IProviderDispatcher {
  constructor(
    private readonly adapter: CohereAdapter,
    private readonly sdk: CohereSdkClient,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(providerId: ProviderId): boolean {
    return String(providerId) === COHERE_PROVIDER_ID;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const start = this.clockMs();
    const adapterRequest = toAdapterRequestFromExecution({
      request,
      canonicalProviderId: COHERE_PROVIDER_ID,
      adapterId: COHERE_ADAPTER_ID,
      nowIso: this.nowIso(),
    });

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
        providerId: asProviderId(COHERE_PROVIDER_ID),
        vendor: COHERE_VENDOR,
        operation: String(translated.value.value.operation ?? "chat"),
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
        providerId: asProviderId(COHERE_PROVIDER_ID),
        vendor: COHERE_VENDOR,
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
    if (!canonical.ok) return canonical;

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: canonical.value.output,
      usage: canonical.value.usage as Readonly<Record<string, unknown>>,
      providerRequestId: String(sdkResult.value.payload.id ?? ""),
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

export interface CohereProviderPlatform {
  readonly mode: "simulated" | "live";
  readonly dispatcher: CohereDispatcher;
}

export function createCohereProvider(options: {
  mode?: "simulated" | "live";
  auth?: CohereAuthConfig;
  httpClient?: ICohereHttpClient;
  nowIso?: () => string;
  clockMs?: () => number;
} = {}): Result<CohereProviderPlatform> {
  const mode = options.mode ?? (options.auth?.apiKey ? "live" : "simulated");
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());

  const http =
    options.httpClient ??
    (mode === "live"
      ? new FetchCohereHttpClient(options.auth ?? {}, clockMs)
      : new SimulatedCohereHttpClient(clockMs));

  const manifest = buildTextProviderManifest({
    providerId: COHERE_PROVIDER_ID,
    vendor: COHERE_VENDOR,
    displayName: "Cohere",
    version: COHERE_PROVIDER_VERSION,
    wireModels: COHERE_SEED_MODELS,
    capabilities: ["text.generate", "text.chat", "embedding.generate"],
    nowIso: nowIso(),
  });

  const adapter = new CohereAdapter(manifest, nowIso);
  const sdk = new CohereSdkClient(http, options.auth ?? {}, nowIso, clockMs);
  const dispatcher = new CohereDispatcher(adapter, sdk, nowIso, clockMs);

  return success({ mode, dispatcher });
}
