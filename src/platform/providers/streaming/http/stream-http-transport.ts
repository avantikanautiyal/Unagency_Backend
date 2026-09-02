/**
 * M9.5O1 — Fetch SSE body with AbortSignal (no whole-response buffering).
 */

import {
  iterateSseFromByteStream,
  type ParsedSseEvent,
  type SseParserOptions,
} from "../parsers/sse-incremental-parser";

export interface StreamHttpRequest {
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface StreamHttpTransport {
  /**
   * Perform request and return a byte stream of the response body.
   * Implementations must NOT buffer the full body when streaming.
   */
  openSse(request: StreamHttpRequest): Promise<{
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: ReadableStream<Uint8Array>;
  }>;
}

/**
 * Production fetch transport — used when credentials present.
 * Tests inject FakeStreamHttpTransport with recorded fixtures.
 */
export class FetchStreamHttpTransport implements StreamHttpTransport {
  async openSse(request: StreamHttpRequest): Promise<{
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: ReadableStream<Uint8Array>;
  }> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(request.signal?.reason);
    if (request.signal) {
      if (request.signal.aborted) controller.abort(request.signal.reason);
      else request.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timeout = request.timeoutMs ?? 120_000;
    const timer = setTimeout(() => controller.abort("connect_timeout"), timeout);

    try {
      const res = await fetch(request.url, {
        method: request.method ?? "POST",
        headers: { ...(request.headers ?? {}), Accept: "text/event-stream" },
        body: request.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.body) {
        throw new Error("missing_response_body");
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, headers, body: res.body };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    } finally {
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Offline: recorded SSE text split into arbitrary TCP-sized chunks. */
export class FakeStreamHttpTransport implements StreamHttpTransport {
  constructor(
    private readonly opts: {
      readonly status?: number;
      readonly sseText: string;
      /** Chunk sizes to simulate TCP fragmentation. */
      readonly chunkSizes?: readonly number[];
      readonly headers?: Readonly<Record<string, string>>;
      readonly onFetch?: (req: StreamHttpRequest) => void;
      readonly failWith?: Error;
    }
  ) {}

  async openSse(request: StreamHttpRequest): Promise<{
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: ReadableStream<Uint8Array>;
  }> {
    this.opts.onFetch?.(request);
    if (request.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    if (this.opts.failWith) throw this.opts.failWith;

    const encoder = new TextEncoder();
    const bytes = encoder.encode(this.opts.sseText);
    const sizes = this.opts.chunkSizes ?? [32, 64, 16, 128];
    let offset = 0;
    let sizeIdx = 0;
    const signal = request.signal;

    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        if (signal?.aborted) {
          controller.error(new DOMException("aborted", "AbortError"));
          return;
        }
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const size = sizes[sizeIdx % sizes.length]!;
        sizeIdx += 1;
        const end = Math.min(bytes.length, offset + size);
        controller.enqueue(bytes.slice(offset, end));
        offset = end;
      },
      cancel: () => undefined,
    });

    return {
      status: this.opts.status ?? 200,
      headers: {
        "content-type": "text/event-stream",
        ...(this.opts.headers ?? {}),
      },
      body,
    };
  }
}

export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
  options: SseParserOptions & { signal?: AbortSignal } = {}
): AsyncGenerator<ParsedSseEvent, void, unknown> {
  yield* iterateSseFromByteStream(body, options);
}
