/**
 * Production media download — HTTPS, SSRF + DNS validation, redirect revalidation,
 * streaming byte limits, timeouts. Used after provider returns temporary URLs.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { MediaDownloadClient } from "./media-ingestion-service";
import {
  validateIngestionUrlWithDns,
  validateRedirectUrlWithDns,
} from "./ssrf-guard";

const DEFAULT_MAX_REDIRECTS = 5;
const PRODUCTION_VALIDATE = { httpsOnly: true, resolveDns: true } as const;

export interface FetchMediaDownloadClientOptions {
  readonly maxRedirects?: number;
  readonly fetchImpl?: typeof fetch;
}

export class FetchMediaDownloadClient implements MediaDownloadClient {
  private readonly maxRedirects: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FetchMediaDownloadClientOptions = {}) {
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async download(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ data: Buffer; mimeType?: string }>> {
    const streamed = await this.downloadStream(url, options);
    if (!streamed.ok) return streamed;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of streamed.value.stream) {
      total += chunk.byteLength;
      if (total > options.maxBytes) {
        return failure(new ValidationError("Download exceeded maxBytes"));
      }
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return success({ data, mimeType: streamed.value.mimeType });
  }

  async downloadStream(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ stream: AsyncIterable<Uint8Array>; mimeType?: string }>> {
    try {
      const response = await this.fetchWithRedirects(url, options.timeoutMs);
      if (!response.ok) return response;

      const contentLength = response.value.contentLength;
      if (contentLength != null && contentLength > options.maxBytes) {
        return failure(new ValidationError("Content-Length exceeds maxBytes"));
      }

      const reader = response.value.body.getReader();
      const mimeType = response.value.mimeType;
      const maxBytes = options.maxBytes;

      async function* chunks(): AsyncIterable<Uint8Array> {
        let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
              throw new Error("Download exceeded maxBytes");
            }
            yield value;
          }
        } finally {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
        }
      }

      return success({ stream: chunks(), mimeType });
    } catch (err) {
      return failure(
        new ValidationError(err instanceof Error ? err.message : "Media stream download failed")
      );
    }
  }

  private async fetchWithRedirects(
    url: string,
    timeoutMs: number
  ): Promise<
    Result<{
      body: ReadableStream<Uint8Array>;
      mimeType?: string;
      contentLength?: number;
    }>
  > {
    let currentUrl = url;

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      const validated = await validateIngestionUrlWithDns(currentUrl, PRODUCTION_VALIDATE);
      if (!validated.ok) return validated;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await this.fetchImpl(validated.value.href, {
          signal: controller.signal,
          redirect: "manual",
        });
      } catch (err) {
        clearTimeout(timer);
        return failure(
          new ValidationError(err instanceof Error ? err.message : "Media download failed")
        );
      }
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          return failure(new ValidationError("Redirect missing Location header"));
        }
        const next = await validateRedirectUrlWithDns(
          currentUrl,
          new URL(location, validated.value).href,
          PRODUCTION_VALIDATE
        );
        if (!next.ok) return next;
        currentUrl = next.value.href;
        continue;
      }

      if (!res.ok || !res.body) {
        return failure(new ValidationError(`Media download HTTP ${res.status}`));
      }

      const cl = res.headers.get("content-length");
      const contentLength = cl ? Number(cl) : undefined;
      if (contentLength != null && !Number.isFinite(contentLength)) {
        return failure(new ValidationError("Invalid Content-Length header"));
      }

      return success({
        body: res.body,
        mimeType: res.headers.get("content-type") ?? undefined,
        contentLength,
      });
    }

    return failure(new ValidationError("Too many media download redirects"));
  }
}
