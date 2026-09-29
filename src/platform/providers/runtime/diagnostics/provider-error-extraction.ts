/**
 * Extract safe, durable provider-failure diagnostics from IntelligenceError metadata.
 * Never returns API keys, auth headers, prompts, or full response bodies.
 */

import type { IntelligenceError } from "../../../core/errors/intelligence-error";

export interface ExtractedProviderErrorDiagnostics {
  readonly httpStatus?: number;
  readonly providerErrorCode?: string;
  /** Short sanitized message — never a full prompt/body dump. */
  readonly sanitizedMessage: string;
  readonly durationMs?: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly failureCategoryHint?: string;
}

const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|x-api-key|cookie|set-cookie|token|secret|password|bearer)$/i;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readHttpStatus(meta: Record<string, unknown>, message: string): number | undefined {
  const candidates = [meta.httpStatus, meta.status, meta.statusCode, meta.statusHint];
  for (const c of candidates) {
    const n = typeof c === "number" ? c : typeof c === "string" ? Number(c) : NaN;
    if (Number.isFinite(n) && n >= 100 && n < 600) return Math.trunc(n);
  }
  const fromMsg = message.match(/\bHTTP\s*(\d{3})\b/i);
  if (fromMsg?.[1]) return Number(fromMsg[1]);
  return undefined;
}

function readProviderErrorCode(
  meta: Record<string, unknown>,
  body: Record<string, unknown> | undefined
): string | undefined {
  const direct = meta.providerErrorCode ?? meta.providerCode ?? meta.errorCode;
  if (typeof direct === "string" && direct.trim()) return direct.trim().slice(0, 120);

  const errObj = asRecord(body?.error) ?? asRecord(meta.error);
  if (errObj) {
    for (const key of ["code", "type", "error_code", "errorCode"] as const) {
      const v = errObj[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
    }
  }
  if (typeof body?.code === "string" && body.code.trim()) {
    return body.code.trim().slice(0, 120);
  }
  return undefined;
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/api[_-]?key[=:]\s*[^\s&]+/gi, "api_key=[redacted]")
    .slice(0, 240);
}

/**
 * Strip sensitive keys from an error body snapshot used only for code extraction.
 * Callers must not persist the returned body.
 */
export function sanitizeErrorBodyHint(
  body: unknown
): Record<string, unknown> | undefined {
  const rec = asRecord(body);
  if (!rec) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (k === "error" && v && typeof v === "object") {
      const err = asRecord(v);
      if (err) {
        out.error = {
          ...(typeof err.code === "string" ? { code: String(err.code).slice(0, 120) } : {}),
          ...(typeof err.type === "string" ? { type: String(err.type).slice(0, 120) } : {}),
          ...(typeof err.message === "string"
            ? { message: sanitizeMessage(String(err.message)) }
            : {}),
        };
      }
      continue;
    }
    if (typeof v === "string") {
      out[k] = v.slice(0, 120);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

function readProviderErrorMessage(
  meta: Record<string, unknown>,
  body: Record<string, unknown> | undefined
): string | undefined {
  const errObj = asRecord(body?.error) ?? asRecord(meta.error);
  if (errObj && typeof errObj.message === "string" && errObj.message.trim()) {
    return errObj.message.trim().slice(0, 240);
  }
  if (typeof body?.message === "string" && body.message.trim()) {
    return body.message.trim().slice(0, 240);
  }
  return undefined;
}

/**
 * Normalize vendor billing / credit exhaustion codes when the HTTP envelope is
 * coarse (e.g. Anthropic HTTP 400 + type=invalid_request_error + credit message).
 */
function normalizeProviderErrorCode(
  rawCode: string | undefined,
  messages: string
): string | undefined {
  const code = (rawCode ?? "").trim();
  const msg = messages.toLowerCase();
  if (
    msg.includes("credit_balance_exhausted") ||
    msg.includes("credit balance") ||
    msg.includes("exhausted your credit") ||
    msg.includes("too low to access") ||
    msg.includes("insufficient_quota") ||
    msg.includes("insufficient balance") ||
    msg.includes("out of credit")
  ) {
    if (
      !code ||
      code.toLowerCase() === "invalid_request_error" ||
      code.toLowerCase() === "invalid_request" ||
      code.toLowerCase() === "provider_error"
    ) {
      return "credit_balance_exhausted";
    }
  }
  return code || undefined;
}

export function extractProviderErrorDiagnostics(
  error: unknown,
  fallbacks?: {
    readonly providerId?: string;
    readonly modelId?: string;
    readonly durationMs?: number;
  }
): ExtractedProviderErrorDiagnostics {
  const intel = error as IntelligenceError | undefined;
  const transportMessage =
    intel && typeof intel.message === "string"
      ? intel.message
      : error instanceof Error
        ? error.message
        : String(error ?? "unknown provider error");

  const meta = asRecord(intel?.metadata) ?? {};
  const body = asRecord(meta.body) ?? asRecord(meta.responseBody);
  const httpStatus = readHttpStatus(meta, transportMessage);
  const bodyMessage = readProviderErrorMessage(meta, body);
  const combinedMessage = bodyMessage
    ? transportMessage.includes(bodyMessage)
      ? transportMessage
      : `${transportMessage}: ${bodyMessage}`
    : transportMessage;
  const rawProviderErrorCode = readProviderErrorCode(meta, body);
  const providerErrorCode = normalizeProviderErrorCode(
    rawProviderErrorCode,
    combinedMessage
  );

  const durationRaw = meta.durationMs ?? meta.latencyMs ?? fallbacks?.durationMs;
  const durationMs =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? Math.max(0, Math.trunc(durationRaw))
      : fallbacks?.durationMs;

  const providerId =
    (typeof meta.providerId === "string" ? meta.providerId : undefined) ??
    fallbacks?.providerId;
  const modelId =
    (typeof meta.modelId === "string" ? meta.modelId : undefined) ??
    fallbacks?.modelId;

  return {
    httpStatus,
    providerErrorCode,
    sanitizedMessage: sanitizeMessage(combinedMessage),
    durationMs,
    providerId,
    modelId,
    failureCategoryHint:
      typeof meta.failureCategoryHint === "string"
        ? meta.failureCategoryHint
        : undefined,
  };
}

/** Prefer structured metadata on IntelligenceError when constructing ProviderError. */
export function attachProviderHttpFailureMetadata(input: {
  readonly status: number;
  readonly body?: unknown;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly durationMs?: number;
}): Record<string, unknown> {
  const body = asRecord(input.body);
  const bodyMessage = readProviderErrorMessage({}, body);
  const rawCode = readProviderErrorCode({}, body);
  const providerErrorCode = normalizeProviderErrorCode(
    rawCode,
    `${input.status} ${bodyMessage ?? ""}`,
  );
  return {
    status: input.status,
    httpStatus: input.status,
    statusCode: input.status,
    ...(providerErrorCode ? { providerErrorCode } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    // Keep a sanitized hint only — never forward auth headers / secrets.
    body: sanitizeErrorBodyHint(input.body) ?? {},
  };
}

function readNetworkErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && cause !== null && "code" in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  if ("code" in (err as object)) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return undefined;
}

/** Structured metadata when fetch fails before any HTTP response exists. */
export function attachProviderNetworkFailureMetadata(input: {
  readonly err: unknown;
  readonly providerId?: string;
  readonly vendor?: string;
  readonly durationMs?: number;
}): Record<string, unknown> {
  const isAbort =
    input.err instanceof Error && input.err.name === "AbortError";
  const message =
    input.err instanceof Error ? input.err.message : String(input.err ?? "");
  const networkErrorCode = readNetworkErrorCode(input.err);
  const isNetwork =
    !isAbort &&
    (Boolean(networkErrorCode) ||
      /econnrefused|enotfound|econnreset|fetch failed|socket hang up|certificate|tls/i.test(
        message,
      ) ||
      (input.err instanceof Error && input.err.name === "TypeError"));

  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.vendor ? { vendor: input.vendor } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(isAbort
      ? {
          httpStatus: 408,
          status: 408,
          failureCategoryHint: "timeout",
        }
      : {}),
    ...(isNetwork && !isAbort
      ? {
          failureCategoryHint: "network",
          noHttpResponse: true,
          ...(networkErrorCode ? { networkErrorCode } : {}),
        }
      : {}),
    ...(input.err instanceof Error
      ? {
          causeName: input.err.name,
          causeMessage: sanitizeMessage(input.err.message),
        }
      : {}),
  };
}
