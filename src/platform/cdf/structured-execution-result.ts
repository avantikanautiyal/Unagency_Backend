/**
 * Normalized structured execution result — single spine representation for
 * provider → job summary → hydration → materialization / ArtifactVersion.
 *
 * Do not reconstruct structured payloads from prose when this object exists.
 */

import { createHash } from "node:crypto";

export const CDF_STRUCTURED_CONTRACT_CONFLICT =
  "CDF_STRUCTURED_CONTRACT_CONFLICT" as const;
export const CDF_STRUCTURED_PAYLOAD_LOST =
  "CDF_STRUCTURED_PAYLOAD_LOST" as const;
export const CDF_STRUCTURED_PAYLOAD_MISSING =
  "CDF_STRUCTURED_PAYLOAD_MISSING" as const;
export const CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE =
  "CDF_STRUCTURED_CONTRACT_RESOLUTION_FAILURE" as const;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Deterministic fingerprint of a structured payload (not semantic content). */
export function hashStructuredPayload(value: unknown): string {
  const body = stableStringify(value);
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

