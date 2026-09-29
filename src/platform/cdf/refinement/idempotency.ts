/**
 * Multi-record CDF action idempotency store (M6).
 * Replaces single-slot lastRequestKey for refinement (and future actions).
 */

import { createHash } from "crypto";
import { refinementError } from "./errors";

export type CdfActionIdempotencyRecord = {
  requestId: string;
  sessionId: string;
  action: string;
  fingerprint: string;
  resultPayload: unknown;
  resultSessionVersion?: number;
  refinementId?: string;
  artifactId?: string;
  artifactVersion?: number;
  createdAt: string;
};

const g = globalThis as typeof globalThis & {
  __cdfActionIdempotency?: Map<string, CdfActionIdempotencyRecord>;
};

function store(): Map<string, CdfActionIdempotencyRecord> {
  if (!g.__cdfActionIdempotency) g.__cdfActionIdempotency = new Map();
  return g.__cdfActionIdempotency;
}

function keyOf(sessionId: string, requestId: string): string {
  return `${sessionId}::${requestId}`;
}

export function resetCdfActionIdempotencyForTests(): void {
  g.__cdfActionIdempotency = new Map();
}

export function fingerprintPayload(parts: unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 40);
}

export function lookupIdempotency(
  sessionId: string,
  requestId: string,
): CdfActionIdempotencyRecord | undefined {
  const rec = store().get(keyOf(sessionId, requestId));
  return rec ? structuredClone(rec) : undefined;
}

export function commitIdempotency(
  record: CdfActionIdempotencyRecord,
): CdfActionIdempotencyRecord {
  const k = keyOf(record.sessionId, record.requestId);
  const existing = store().get(k);
  if (existing && existing.fingerprint !== record.fingerprint) {
    throw refinementError(
      "IDEMPOTENCY_CONFLICT",
      `requestId ${record.requestId} already used with a different payload`,
      {
        requestId: record.requestId,
        existingFingerprint: existing.fingerprint,
        fingerprint: record.fingerprint,
      },
    );
  }
  if (existing) return structuredClone(existing);
  const clone = structuredClone(record);
  store().set(k, clone);
  return structuredClone(clone);
}
