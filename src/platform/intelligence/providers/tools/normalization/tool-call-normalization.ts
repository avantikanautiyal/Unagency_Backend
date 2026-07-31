/**
 * Normalize vendor tool_calls ↔ canonical ToolCall; build continuation messages.
 */

import type { ToolCall, ToolDefinition } from "../contracts/tool-contracts";
import { toToolRoleMessage } from "../safety/tool-result-sanitizer";
import type { ToolExecutionResult } from "../contracts/tool-contracts";

export function normalizeOpenAIToolCalls(output: Readonly<Record<string, unknown>>): ToolCall[] {
  const raw = output.tool_calls;
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const fn = (rec.function as Record<string, unknown> | undefined) ?? {};
    const name = String(fn.name ?? rec.name ?? "").trim();
    if (!name) continue;
    const id = String(rec.id ?? `call_${i}`);
    let args: Record<string, unknown> = {};
    const argRaw = fn.arguments ?? rec.arguments ?? {};
    if (typeof argRaw === "string") {
      try {
        const parsed = JSON.parse(argRaw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = { _raw: argRaw };
      }
    } else if (argRaw && typeof argRaw === "object" && !Array.isArray(argRaw)) {
      args = argRaw as Record<string, unknown>;
    }
    calls.push(Object.freeze({ id, name, arguments: Object.freeze(args) }));
  }
  return calls;
}

export function toOpenAIToolDefinitions(
  tools: readonly ToolDefinition[]
): readonly Record<string, unknown>[] {
  return tools.map((t) =>
    Object.freeze({
      type: "function",
      function: Object.freeze({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }),
    })
  );
}

export function buildContinuationMessages(input: {
  readonly priorMessages: readonly Record<string, unknown>[];
  readonly assistantToolCalls: readonly unknown[];
  readonly results: readonly ToolExecutionResult[];
}): readonly Record<string, unknown>[] {
  const assistant = Object.freeze({
    role: "assistant",
    content: null,
    tool_calls: input.assistantToolCalls,
  });
  const toolMessages = input.results.map((r) =>
    toToolRoleMessage({
      toolCallId: r.toolCallId,
      toolName: r.toolName,
      output:
        r.status === "succeeded" || r.status === "skipped_idempotent"
          ? r.output
          : { error: r.error },
    })
  );
  return Object.freeze([...input.priorMessages, assistant, ...toolMessages]);
}

export function extractFinishReason(output: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof output.finishReason === "string") return output.finishReason;
  if (typeof output.finish_reason === "string") return output.finish_reason;
  return undefined;
}

export function outputHasToolCalls(output: Readonly<Record<string, unknown>> | undefined): boolean {
  if (!output) return false;
  return normalizeOpenAIToolCalls(output).length > 0;
}
