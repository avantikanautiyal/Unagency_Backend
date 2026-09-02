/**
 * HTTP transport for verified vendor video APIs.
 * Auth headers are supplied per-request by the vendor protocol (not assumed Bearer).
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";

export interface VideoHttpMultipartFile {
  readonly fieldName: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export interface VideoHttpRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly body?: Readonly<Record<string, unknown>>;
  /** Multipart form upload — when set, body is ignored and Content-Type is set by boundary. */
  readonly multipart?: VideoHttpMultipartFile;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface VideoHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly latencyMs: number;
}

export interface IVideoHttpClient {
  send(request: VideoHttpRequest): Promise<Result<VideoHttpResponse>>;
}

export class FetchVideoHttpClient implements IVideoHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly clockMs: () => number = () => Date.now(),
    private readonly providerId = "video"
  ) {}

  async send(request: VideoHttpRequest): Promise<Result<VideoHttpResponse>> {
    const base = this.baseUrl.replace(/\/$/, "");
    const url = `${base}${request.path.startsWith("/") ? "" : "/"}${request.path}`;
    const headers: Record<string, string> = {
      ...(request.headers ?? {}),
    };

    let body: BodyInit | undefined;
    if (request.multipart) {
      const form = new FormData();
      const blob = new Blob([request.multipart.data], {
        type: request.multipart.contentType,
      });
      form.append(request.multipart.fieldName, blob, request.multipart.filename);
      body = form;
      delete headers["Content-Type"];
      delete headers["content-type"];
    } else {
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      body = request.body ? JSON.stringify(request.body) : undefined;
    }

    const start = this.clockMs();
    try {
      const controller = new AbortController();
      const timeout = request.timeoutMs ?? 120_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: request.method,
        headers,
        body,
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
        const detail =
          typeof parsed.detail === "string"
            ? parsed.detail
            : typeof parsed.message === "string"
              ? parsed.message
              : typeof parsed.error === "string"
                ? parsed.error
                : undefined;
        const message = detail
          ? res.status === 403 && /not authenticated|invalid api key/i.test(detail)
            ? `Luma API authentication failed (${detail}) — verify LUMA_API_KEY at platform.lumalabs.ai`
            : detail
          : `HTTP ${res.status}`;
        return failure(
          new ProviderError(message, {
            statusCode: res.status,
            providerId: this.providerId,
          } as never)
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
        new ProviderError(err instanceof Error ? err.message : String(err), {
          providerId: this.providerId,
        } as never)
      );
    }
  }
}

/** Recording fake HTTP for vendor contract tests — zero network. */
export class RecordingVideoHttpClient implements IVideoHttpClient {
  readonly calls: VideoHttpRequest[] = [];
  constructor(
    private readonly handler: (
      request: VideoHttpRequest
    ) => Result<VideoHttpResponse> | Promise<Result<VideoHttpResponse>>
  ) {}

  async send(request: VideoHttpRequest): Promise<Result<VideoHttpResponse>> {
    this.calls.push(request);
    return this.handler(request);
  }
}

export function requireCredential(value: string | undefined, envVar: string): Result<string> {
  if (!value?.trim()) return failure(new ValidationError(`${envVar} required`));
  return success(value.trim());
}
