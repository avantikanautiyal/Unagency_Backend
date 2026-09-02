/**
 * M9.5O1 — Incremental SSE parser (TCP-chunk safe).
 * Does not assume one network chunk = one SSE event.
 */

export interface ParsedSseEvent {
  readonly event?: string;
  readonly id?: string;
  readonly data: string;
  readonly comments: readonly string[];
}

export interface SseParserOptions {
  readonly maxEventBytes?: number;
}

export class IncrementalSseParser {
  private buffer = "";
  private readonly maxEventBytes: number;
  private oversized = false;

  constructor(options: SseParserOptions = {}) {
    this.maxEventBytes = options.maxEventBytes ?? 1_048_576;
  }

  get exceededMaxEventBytes(): boolean {
    return this.oversized;
  }

  /**
   * Push decoded UTF-8 text; returns complete SSE events.
   */
  push(text: string): ParsedSseEvent[] {
    if (this.oversized) return [];
    this.buffer += text;
    if (this.buffer.length > this.maxEventBytes * 2) {
      this.oversized = true;
      this.buffer = "";
      return [];
    }
    return this.drain();
  }

  /** Flush remaining buffer at EOF (incomplete event discarded). */
  finish(): ParsedSseEvent[] {
    if (this.oversized) return [];
    // Incomplete trailing event without blank-line terminator is dropped.
    this.buffer = "";
    return [];
  }

  private drain(): ParsedSseEvent[] {
    const out: ParsedSseEvent[] = [];
    // Normalize CRLF → LF for splitting
    this.buffer = this.buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (true) {
      const sep = this.buffer.indexOf("\n\n");
      if (sep < 0) break;
      const raw = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      if (Buffer.byteLength(raw, "utf8") > this.maxEventBytes) {
        this.oversized = true;
        this.buffer = "";
        return out;
      }
      const parsed = parseSseBlock(raw);
      if (parsed) out.push(parsed);
    }
    return out;
  }
}

function parseSseBlock(raw: string): ParsedSseEvent | null {
  if (!raw.trim()) return null;
  const lines = raw.split("\n");
  let event: string | undefined;
  let id: string | undefined;
  const dataLines: string[] = [];
  const comments: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      comments.push(line.slice(1).trim());
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("id:")) {
      id = line.slice(3).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
      continue;
    }
    // Unknown field — ignore per SSE spec
  }

  if (dataLines.length === 0 && !event && comments.length > 0) {
    // Heartbeat / comment-only block
    return { data: "", comments };
  }
  if (dataLines.length === 0 && !event) return null;

  return {
    event,
    id,
    data: dataLines.join("\n"),
    comments,
  };
}

/**
 * Decode a ReadableStream of bytes into SSE events with Text-8 safety.
 */
export async function* iterateSseFromByteStream(
  stream: ReadableStream<Uint8Array>,
  options: SseParserOptions & { signal?: AbortSignal } = {}
): AsyncGenerator<ParsedSseEvent, void, unknown> {
  const parser = new IncrementalSseParser(options);
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });

  try {
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel("aborted").catch(() => undefined);
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const ev of parser.push(text)) {
        if (parser.exceededMaxEventBytes) {
          throw new Error("STREAM_EVENT_TOO_LARGE");
        }
        // Skip pure comment/heartbeat blocks with empty data
        if (!ev.data && ev.comments.length > 0 && !ev.event) continue;
        yield ev;
      }
      if (parser.exceededMaxEventBytes) {
        throw new Error("STREAM_EVENT_TOO_LARGE");
      }
    }
    const tail = decoder.decode();
    if (tail) {
      for (const ev of parser.push(tail)) {
        if (!ev.data && ev.comments.length > 0 && !ev.event) continue;
        yield ev;
      }
    }
    parser.finish();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
