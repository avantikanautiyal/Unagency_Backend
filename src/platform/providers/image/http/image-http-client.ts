/**
 * HTTP transport for verified vendor image APIs.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError } from "../../../core/errors";

export interface ImageHttpRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface ImageHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
}

export interface IImageHttpClient {
  send(request: ImageHttpRequest): Promise<Result<ImageHttpResponse>>;
}

export class FetchImageHttpClient implements IImageHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly clockMs: () => number = () => Date.now(),
    private readonly providerId = "image"
  ) {}

  async send(request: ImageHttpRequest): Promise<Result<ImageHttpResponse>> {
    const base = this.baseUrl.replace(/\/$/, "");
    const url = `${base}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      ...(request.headers ?? {}),
    };
    if (!headers["Content-Type"] && !headers["content-type"] && request.body) {
      headers["Content-Type"] = "application/json";
    }

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 180_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        parsed = { raw: text };
      }

      const headerMap: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerMap[k.toLowerCase()] = v;
      });

      if (!res.ok) {
        return failure(
          new ProviderError(`${this.providerId} HTTP ${res.status}`, {
            status: res.status,
            body: parsed,
            providerId: this.providerId,
          })
        );
      }

      return success({
        status: res.status,
        headers: headerMap,
        body: parsed,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      return failure(
        new ProviderError(err instanceof Error ? err.message : "Image HTTP failed", {
          cause: err,
          providerId: this.providerId,
        })
      );
    }
  }
}
