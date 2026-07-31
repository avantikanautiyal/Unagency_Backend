/**
 * Anthropic HTTP transport — Messages API.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import { ANTHROPIC_BASE_URL } from "../constants";

export interface AnthropicAuthConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface AnthropicHttpRequest {
  readonly method: "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly timeoutMs?: number;
}

export interface AnthropicHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
}

export interface IAnthropicHttpClient {
  send(request: AnthropicHttpRequest): Promise<Result<AnthropicHttpResponse>>;
}

export class FetchAnthropicHttpClient implements IAnthropicHttpClient {
  constructor(
    private readonly auth: AnthropicAuthConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: AnthropicHttpRequest): Promise<Result<AnthropicHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(new ValidationError("ANTHROPIC_API_KEY required for live HTTP"));
    }

    const base = this.auth.baseUrl ?? ANTHROPIC_BASE_URL;
    const url = `${base.replace(/\/$/, "")}${request.path}`;
    const headers: Record<string, string> = {
      "x-api-key": this.auth.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
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
          new ProviderError(`Anthropic HTTP ${res.status}`, { status: res.status, body })
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
          ? "Anthropic HTTP timeout"
          : err instanceof Error
            ? err.message
            : "Anthropic HTTP failed";
      return failure(
        new ProviderError(message, {
          cause: err,
          status: err instanceof Error && err.name === "AbortError" ? 408 : undefined,
        })
      );
    }
  }
}
