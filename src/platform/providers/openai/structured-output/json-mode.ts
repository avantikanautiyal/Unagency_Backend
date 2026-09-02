/**
 * Structured output helpers.
 */

export function withJsonObjectFormat(
  body: Record<string, unknown>
): Record<string, unknown> {
  return { ...body, response_format: { type: "json_object" } };
}
