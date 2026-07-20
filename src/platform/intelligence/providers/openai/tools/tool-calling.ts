/**
 * Tool calling helpers.
 */

export function hasToolCalls(output: Readonly<Record<string, unknown>>): boolean {
  return Array.isArray(output.tool_calls) && output.tool_calls.length > 0;
}
