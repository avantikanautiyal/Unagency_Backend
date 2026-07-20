/**
 * Secret masking — irreversible for logs/telemetry/diagnostics.
 */

import { success, type Result } from "../../../intelligence/shared/result";

export function maskSecretValue(value: string, visibleTail = 4): string {
  if (!value) return "<masked:0>";
  if (value.length <= visibleTail) {
    return `****`;
  }
  const tail = value.slice(-visibleTail);
  return `${"*".repeat(Math.min(12, value.length - visibleTail))}${tail}`;
}

export function maskFull(_value: string): string {
  return "<masked>";
}

export function maskSecret(value: string): Result<string> {
  return success(maskSecretValue(value));
}

/** Scrub known secret-like keys from metadata/objects for diagnostics. */
export function scrubObject(
  input: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const key = k.toLowerCase();
    if (
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("token") ||
      key.includes("apikey") ||
      key.includes("api_key") ||
      key.includes("credential")
    ) {
      out[k] = typeof v === "string" ? maskSecretValue(v) : "<masked>";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrubObject(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
