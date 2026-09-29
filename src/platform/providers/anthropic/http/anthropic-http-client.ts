/**
 * Anthropic HTTP transport — Messages API.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
import { ANTHROPIC_BASE_URL } from "../constants";
import { attachProviderHttpFailureMetadata } from "../../runtime/diagnostics/provider-error-extraction";

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
        const durationMs = this.clockMs() - start;
        const errObj =
          body.error && typeof body.error === "object"
            ? (body.error as Record<string, unknown>)
            : undefined;
        const detail =
          typeof errObj?.message === "string" && errObj.message.trim()
            ? errObj.message.trim().slice(0, 240)
            : undefined;
        return failure(
          new ProviderError(
            detail
              ? `Anthropic HTTP ${res.status}: ${detail}`
              : `Anthropic HTTP ${res.status}`,
            attachProviderHttpFailureMetadata({
              status: res.status,
              body,
              providerId: "provider.anthropic",
              durationMs,
            })
          )
        );
      }

      return success({
        status: res.status,
        headers: headerMap,
        body,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isNetwork =
        err instanceof Error &&
        (/econnrefused|enotfound|econnreset|fetch failed|socket hang up/i.test(err.message) ||
          err.name === "TypeError");
      const message = isAbort
        ? "Anthropic HTTP timeout"
        : err instanceof Error
          ? err.message
          : "Anthropic HTTP failed";
      return failure(
        new ProviderError(message, {
          cause: err,
          ...(isAbort ? { status: 408, httpStatus: 408 } : {}),
          ...(isNetwork && !isAbort ? { failureCategoryHint: "network" } : {}),
          durationMs: this.clockMs() - start,
          providerId: "provider.anthropic",
        })
      );
    }
  }
}
