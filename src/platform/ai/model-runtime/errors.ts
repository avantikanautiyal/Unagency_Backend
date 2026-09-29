/**
 * Phase 11 — Map provider failures to runtime-level categories without
 * swallowing diagnostics. Does not invent CDF semantic errors.
 */

import type { ModelRuntimeErrorCategory } from "./types";

export function categorizeProviderRuntimeError(
  error: unknown,
): {
  readonly category: ModelRuntimeErrorCategory;
  readonly messageSafe: string;
} {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "provider error")
      : String(error ?? "provider error");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "").toLowerCase()
      : "";
  const lower = `${code} ${message}`.toLowerCase();

  let category: ModelRuntimeErrorCategory = "provider_unknown";
  if (lower.includes("timeout") || lower.includes("timed out")) {
    category = "provider_timeout";
  } else if (lower.includes("rate") && lower.includes("limit")) {
    category = "provider_rate_limit";
  } else if (
    lower.includes("auth") ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    category = "provider_auth_config";
  } else if (
    lower.includes("unavailable") ||
    lower.includes("not found") ||
    lower.includes("no provider")
  ) {
    category = "provider_unavailable";
  } else if (
    lower.includes("unsupported") ||
    lower.includes("capability")
  ) {
    category = "capability_unsupported";
  } else if (
    lower.includes("invalid") ||
    lower.includes("validation") ||
    lower.includes("bad request")
  ) {
    category = "invalid_provider_request";
  } else if (
    lower.includes("parse") ||
    lower.includes("schema") ||
    lower.includes("malformed")
  ) {
    category = "provider_response_invalid";
  }

  return { category, messageSafe: message.slice(0, 200) };
}
