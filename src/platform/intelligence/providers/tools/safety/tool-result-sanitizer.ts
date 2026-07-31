/**
 * Tool result sanitization — treat tool output as untrusted DATA, not system instructions.
 */

const SECRET_PATTERNS = [
  /authorization\s*[:=]\s*["']?bearer\s+[a-z0-9\-._~+/]+=*/gi,
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9\-_]{8,}/gi,
  /sk-[a-z0-9]{10,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
];

const MAX_RESULT_CHARS = 16_384;

export function sanitizeToolResult(output: unknown): unknown {
  if (output === null || output === undefined) return output;
  if (typeof output === "string") {
    return redactString(boundString(output));
  }
  if (typeof output === "number" || typeof output === "boolean") return output;
  try {
    const json = JSON.stringify(output);
    if (!json) return null;
    if (json.length > MAX_RESULT_CHARS) {
      return {
        _truncated: true,
        preview: redactString(json.slice(0, MAX_RESULT_CHARS)),
      };
    }
    return JSON.parse(redactString(json));
  } catch {
    return { _invalid: true };
  }
}

export function toToolRoleMessage(input: {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
}): Readonly<Record<string, unknown>> {
  // Structural boundary: role=tool — never system/developer.
  return Object.freeze({
    role: "tool",
    tool_call_id: input.toolCallId,
    name: input.toolName,
    content:
      typeof input.output === "string"
        ? input.output
        : JSON.stringify(input.output ?? null),
  });
}

function boundString(s: string): string {
  return s.length > MAX_RESULT_CHARS ? s.slice(0, MAX_RESULT_CHARS) : s;
}

function redactString(s: string): string {
  let out = s;
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p, "[REDACTED]");
  }
  return out;
}
