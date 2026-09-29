/**
 * Shared parsing helpers for M3C adapters.
 * Structural only — never invent creative content.
 */

import {
  isCdfCanonicalArtifactId,
  isExecutionIdShape,
  isMediaArtifactIdShape,
  isVaultAssetObjectIdShape,
} from "../artifacts/ids";
import { generationArtifactError } from "./errors";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function parseJsonIfString(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t) return raw;
  // Strip markdown fences
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const body = fenced ? fenced[1]!.trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    return raw;
  }
}

export function requireRecord(
  raw: unknown,
  label: string,
): Record<string, unknown> {
  const parsed = parseJsonIfString(raw);
  if (parsed == null || parsed === "") {
    throw generationArtifactError(
      "GENERATION_OUTPUT_MISSING",
      `${label}: generation output is missing`,
    );
  }
  if (!isRecord(parsed)) {
    throw generationArtifactError(
      "GENERATION_OUTPUT_MALFORMED",
      `${label}: expected a JSON object`,
    );
  }
  return parsed;
}

export function assertVaultAssetIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  for (const id of ids) {
    if (isExecutionIdShape(id)) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        "Vault asset id must not be an execution id",
        { id },
      );
    }
    if (isCdfCanonicalArtifactId(id)) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        "Vault asset id must not be a CDF artifact id",
        { id },
      );
    }
    if (isMediaArtifactIdShape(id)) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        "Vault asset id must not be a legacy art_* media id",
        { id },
      );
    }
    if (/^https?:\/\//i.test(id) || id.includes("://")) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        "Vault asset id must not be a URL",
        { id },
      );
    }
    if (!isVaultAssetObjectIdShape(id)) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        "Vault asset id must be a 24-hex ObjectId",
        { id },
      );
    }
  }
  return ids;
}

/** Unwrap common provider envelopes without inventing fields. */
export function unwrapProviderEnvelope(data: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "PresentationRoutes",
    "presentationRoutes",
    "PresentationPlan",
    "presentationPlan",
    "data",
    "result",
    "output",
    "response",
    "structured",
    "value",
  ];
  for (const key of keys) {
    const nested = data[key];
    if (isRecord(nested)) return unwrapProviderEnvelope(nested);
  }
  return data;
}
