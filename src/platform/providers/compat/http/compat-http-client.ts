/**
 * Parameterized OpenAI-compatible HTTP transport for compat text providers.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
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
            body,
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
      const message =
        err instanceof Error && err.name === "AbortError"
          ? `${this.config.vendor} HTTP timeout`
          : err instanceof Error
            ? err.message
            : `${this.config.vendor} HTTP failed`;
      return failure(
        new ProviderError(message, {
          cause: err,
          status: err instanceof Error && err.name === "AbortError" ? 408 : undefined,
        })
      );
    }
  }
}
