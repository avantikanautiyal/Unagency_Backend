/**
 * Parameterized OpenAI-compatible HTTP transport for compat text providers.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
import { attachProviderNetworkFailureMetadata } from "../../runtime/diagnostics/provider-error-extraction";
import type { TextProviderAuthConfig, TextProviderConfig } from "../contracts/text-provider-config";

export interface CompatHttpRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly stream?: boolean;
  readonly timeoutMs?: number;
}

export interface CompatHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly rawText?: string;
  readonly latencyMs: number;
}

export interface ICompatHttpClient {
  send(request: CompatHttpRequest): Promise<Result<CompatHttpResponse>>;
}

export class FetchCompatHttpClient implements ICompatHttpClient {
  constructor(
    private readonly config: TextProviderConfig,
    private readonly auth: TextProviderAuthConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: CompatHttpRequest): Promise<Result<CompatHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(
        new ValidationError(
          `${this.config.credentialEnvVar} required for live ${this.config.vendor} HTTP`
        )
      );
    }

    const base = this.auth.baseUrl ?? this.config.baseUrl;
    const url = `${base.replace(/\/$/, "")}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.apiKey}`,
      "Content-Type": "application/json",
      ...(this.auth.extraHeaders ?? {}),
    };

    // Safe request identity for diagnostics — host + model only; never the
    // Authorization header, key, or request body.
    const safeIdentity = compatRequestDiagnostics(url, request.body);

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 60_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers,
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
          new ProviderError(`${this.config.vendor} HTTP ${res.status}`, {
            status: res.status,
            httpStatus: res.status,
            noHttpResponse: false,
            body,
            ...safeIdentity,
            ...providerErrorIdentity(body),
          })
        );
      }

      return success({
        status: res.status,
        headers: headerMap,
        body,
        rawText: text,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      const durationMs = this.clockMs() - start;
      const isAbort = err instanceof Error && err.name === "AbortError";
      const message = isAbort
        ? `${this.config.vendor} HTTP timeout`
        : err instanceof Error
          ? err.message
          : `${this.config.vendor} HTTP failed`;
      return failure(
        new ProviderError(message, {
          cause: err,
          ...(isAbort ? { status: 408, httpStatus: 408 } : {}),
          ...attachProviderNetworkFailureMetadata({
            err,
            vendor: this.config.vendor,
            providerId: this.config.canonicalProviderId,
            durationMs,
          }),
          ...safeIdentity,
        })
      );
    }
  }
}

export function compatRequestDiagnostics(
  url: string,
  body: unknown,
): { endpointHost?: string; model?: string } {
  let endpointHost: string | undefined;
  try {
    endpointHost = new URL(url).host;
  } catch {
    endpointHost = undefined;
  }
  const model =
    body && typeof body === "object" && typeof (body as { model?: unknown }).model === "string"
      ? (body as { model: string }).model
      : undefined;
  return {
    ...(endpointHost ? { endpointHost } : {}),
    ...(model ? { model } : {}),
  };
}

/** OpenAI-compatible `{ error: { code, type } }` — typed fields only. */
export function providerErrorIdentity(
  body: Record<string, unknown>,
): { providerErrorCode?: string; providerErrorType?: string } {
  const e = body.error;
  if (!e || typeof e !== "object") return {};
  const { code, type } = e as { code?: unknown; type?: unknown };
  return {
    ...(typeof code === "string" && code ? { providerErrorCode: code } : {}),
    ...(typeof type === "string" && type ? { providerErrorType: type } : {}),
  };
}
