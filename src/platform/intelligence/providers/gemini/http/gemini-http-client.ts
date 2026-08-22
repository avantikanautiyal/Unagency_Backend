/**
 * Gemini HTTP transport — Generative Language API.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import { GEMINI_BASE_URL } from "../constants";

export interface GeminiAuthConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface GeminiHttpRequest {
  readonly method: "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
}

export interface GeminiHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
}

export interface IGeminiHttpClient {
  send(request: GeminiHttpRequest): Promise<Result<GeminiHttpResponse>>;
}

export class FetchGeminiHttpClient implements IGeminiHttpClient {
  constructor(
    private readonly auth: GeminiAuthConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: GeminiHttpRequest): Promise<Result<GeminiHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(new ValidationError("GEMINI_API_KEY required for live HTTP"));
    }

    const base = this.auth.baseUrl ?? GEMINI_BASE_URL;
    const separator = request.path.includes("?") ? "&" : "?";
    const url = `${base.replace(/\/$/, "")}${request.path}${separator}key=${encodeURIComponent(this.auth.apiKey)}`;

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 60_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
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

      const headerMap: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerMap[k] = v;
      });

      if (!res.ok) {
        return failure(
          new ProviderError(`Gemini HTTP ${res.status}`, { status: res.status, body })
        );
      }

      return success({
        status: res.status,
        headers: headerMap,
        body,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Gemini HTTP timeout"
          : err instanceof Error
            ? err.message
            : "Gemini HTTP failed";
      return failure(
        new ProviderError(message, {
          cause: err,
          status: err instanceof Error && err.name === "AbortError" ? 408 : undefined,
        })
      );
    }
  }
}

export class SimulatedGeminiHttpClient implements IGeminiHttpClient {
  constructor(
    private readonly clockMs: () => number = () => Date.now(),
    private readonly injectError?: (request: GeminiHttpRequest) => ProviderError | undefined
  ) {}

  async send(request: GeminiHttpRequest): Promise<Result<GeminiHttpResponse>> {
    const start = this.clockMs();
    const injected = this.injectError?.(request);
    if (injected) return failure(injected);

    const modelMatch = request.path.match(/models\/([^/:]+)/);
    const model = modelMatch?.[1] ?? "gemini-2.5-flash";
    const contents = request.body?.contents as Array<Record<string, unknown>> | undefined;
    const hasVision = contents?.some((c) =>
      Array.isArray(c.parts) &&
      (c.parts as unknown[]).some(
        (p) => typeof p === "object" && p && "inlineData" in (p as Record<string, unknown>)
      )
    );
    const responseText = hasVision
      ? `[simulated:gemini:vision] analysis for ${model}`
      : `[simulated:gemini] response for ${model}`;

    return success({
      status: 200,
      headers: {},
      body: {
        candidates: [
          {
            content: {
              parts: [{ text: responseText }],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 22,
          totalTokenCount: 33,
        },
      },
      latencyMs: this.clockMs() - start,
    });
  }
}
