/**
 * Streaming helpers — SSE chunk parsing reserved for live stream mode.
 */

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
