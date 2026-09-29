/**
 * Deterministic render identity / options hashing (M5).
 */

import { createHash } from "crypto";
import type { CdfRenderFormat, CdfRenderOptions, CdfRenderPurpose } from "./types";

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableSerialize(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(",")}}`;
}

export function hashRenderOptions(options: CdfRenderOptions = {}): string {
  const normalized: CdfRenderOptions = {
    pageSize: options.pageSize,
    widthPx: options.widthPx,
    heightPx: options.heightPx,
    imageQuality: options.imageQuality,
    includeNotes: options.includeNotes,
    background: options.background,
    extras: options.extras,
  };
  return createHash("sha256")
    .update(stableSerialize(normalized), "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * Deterministic render identity:
 * artifactId + version + format + purpose + rendererId + rendererVersion + optionsHash
 */
export function computeRenderKey(input: {
  artifactId: string;
  artifactVersion: number;
  format: CdfRenderFormat;
  purpose: CdfRenderPurpose;
  rendererId: string;
  rendererVersion: string;
  optionsHash: string;
}): string {
  const payload = [
    input.artifactId,
    String(input.artifactVersion),
    input.format,
    input.purpose,
    input.rendererId,
    input.rendererVersion,
    input.optionsHash,
  ].join("|");
  return `rnd:${createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 40)}`;
}
