/**
 * HTTP transport for verified vendor audio APIs.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError } from "../../../core/errors";

export interface AudioHttpRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly expectBinary?: boolean;
}

export interface AudioHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly binary?: Buffer;
  readonly contentType?: string;
  readonly latencyMs: number;
}

export interface IAudioHttpClient {
  send(request: AudioHttpRequest): Promise<Result<AudioHttpResponse>>;
}

export class FetchAudioHttpClient implements IAudioHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly clockMs: () => number = () => Date.now(),
    private readonly providerId = "audio"
  ) {}

  async send(request: AudioHttpRequest): Promise<Result<AudioHttpResponse>> {
    const base = this.baseUrl.replace(/\/$/, "");
    const url = `${base}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      ...(request.headers ?? {}),
    };
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 120_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = res.headers.get("content-type") ?? undefined;
      const isBinary =
        request.expectBinary ||
        (contentType &&
          !contentType.includes("application/json") &&
          !contentType.includes("text/"));

      let parsed: Record<string, unknown> = {};
      let binary: Buffer | undefined;
      if (isBinary) {
        binary = Buffer.from(await res.arrayBuffer());
        parsed = {
          _contentType: contentType ?? "audio/mpeg",
          _audioStorageRef: "inline:binary:0",
        };
      } else {
        const text = await res.text();
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          parsed = { raw: text };
        }
      }

      const headerMap: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headerMap[k.toLowerCase()] = v;
      });

      if (!res.ok) {
        const message =
          typeof parsed.detail === "string"
            ? parsed.detail
            : typeof parsed.message === "string"
              ? parsed.message
              : typeof parsed.error === "string"
                ? parsed.error
                : `Audio HTTP ${res.status}`;
        return failure(
          new ProviderError(message, {
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
        binary,
        contentType,
        latencyMs: this.clockMs() - start,
      });
    } catch (err) {
      return failure(
        new ProviderError(err instanceof Error ? err.message : "Audio HTTP failed", {
          cause: err,
          providerId: this.providerId,
        })
      );
    }
  }
}
