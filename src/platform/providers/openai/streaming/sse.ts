/**
 * OpenAI SSE line helper — thin wrapper over incremental parser family.
 * Prefer IncrementalSseParser for production streaming.
 */

import { IncrementalSseParser } from "../../streaming/parsers/sse-incremental-parser";

export function parseOpenAISseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return { done: true };
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Parse a complete multi-line SSE buffer into OpenAI data payloads. */
export function parseOpenAISseBuffer(text: string): Record<string, unknown>[] {
  const parser = new IncrementalSseParser();
  const events = parser.push(text.endsWith("\n\n") ? text : `${text}\n\n`);
  const out: Record<string, unknown>[] = [];
  for (const ev of events) {
    if (!ev.data) continue;
    if (ev.data.trim() === "[DONE]") {
      out.push({ done: true });
      continue;
    }
    try {
      out.push(JSON.parse(ev.data) as Record<string, unknown>);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
