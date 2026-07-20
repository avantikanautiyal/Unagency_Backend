/**
 * OpenAI HTTP transport — lives in the openai leaf only.
 * Uses fetch for live mode; injectable client for tests.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import type { OpenAIAuthenticationConfig } from "../contracts/openai-contracts";
import { OPENAI_BASE_URL } from "../constants";

export interface OpenAIHttpRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly stream?: boolean;
  readonly timeoutMs?: number;
}

export interface OpenAIHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly rawText?: string;
  readonly latencyMs: number;
}

export interface IOpenAIHttpClient {
  send(request: OpenAIHttpRequest): Promise<Result<OpenAIHttpResponse>>;
}

export class FetchOpenAIHttpClient implements IOpenAIHttpClient {
  constructor(
    private readonly auth: OpenAIAuthenticationConfig,
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  async send(request: OpenAIHttpRequest): Promise<Result<OpenAIHttpResponse>> {
    if (!this.auth.apiKey?.trim()) {
      return failure(new ValidationError("OpenAI apiKey required for live HTTP"));
    }

    const base = this.auth.baseUrl ?? OPENAI_BASE_URL;
    const url = `${base.replace(/\/$/, "")}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.auth.organizationId) headers["OpenAI-Organization"] = this.auth.organizationId;
    if (this.auth.projectId) headers["OpenAI-Project"] = this.auth.projectId;

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
          new ProviderError(`OpenAI HTTP ${res.status}`, {
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
      return failure(
        new ProviderError(err instanceof Error ? err.message : "OpenAI HTTP failed", {
          cause: err,
        })
      );
    }
  }
}
