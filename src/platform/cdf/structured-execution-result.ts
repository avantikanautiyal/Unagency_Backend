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

export type NormalizedStructuredExecutionResult = {
  readonly structured: unknown;
  readonly structuredContractName: string;
  readonly structuredSchemaVersion: string;
  readonly structuredValid: boolean;
  readonly structuredPayloadHash: string;
  readonly source: "provider" | "runtime" | "job_summary" | "hydration";
  readonly provenance?: Readonly<Record<string, unknown>>;
};

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

export function buildNormalizedStructuredExecutionResult(input: {
  readonly structured: unknown;
  readonly structuredContractName: string;
  readonly structuredSchemaVersion?: string;
  readonly structuredValid: boolean;
  readonly source: NormalizedStructuredExecutionResult["source"];
  readonly provenance?: Readonly<Record<string, unknown>>;
}): NormalizedStructuredExecutionResult {
  return {
    structured: input.structured,
    structuredContractName: input.structuredContractName,
    structuredSchemaVersion: input.structuredSchemaVersion ?? "1",
    structuredValid: input.structuredValid,
    structuredPayloadHash: hashStructuredPayload(input.structured),
    source: input.source,
    ...(input.provenance ? { provenance: input.provenance } : {}),
  };
}

export function readStructuredPayloadHash(
  container: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (!container) return undefined;
  const h = container.structuredPayloadHash;
  return typeof h === "string" && h.trim() ? h.trim() : undefined;
}
