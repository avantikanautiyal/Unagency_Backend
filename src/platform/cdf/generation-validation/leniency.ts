/**
 * Requirement-check leniency for the M4 acceptance gate.
 *
 * Only serious brief misses block acceptance:
 *  - logo / reference asset and exact headline wording (every attempt)
 *  - size / format (attempts before the final automatic attempt)
 * Everything else (counts, colours, sections, forbidden terms…) is downgraded
 * to a warning so usable creatives are not rejected for minor gaps.
 *
 * Requirements can only block when the artifact family exposes the observed
 * field. Social-media / generic payloads expose no dimensions, headlines or
 * logo roles (see observe.ts), so their requirement checks never block —
 * otherwise every brief mentioning a size, logo or headline would fail.
 */

import type { CdfValidationCheck } from "./types";

export const CDF_QUALITY_MAX_ATTEMPTS = 3;

const OBSERVABLE_ARTIFACT_PREFIXES = ["presentation.", "packaging."] as const;

const SIZE_FORMAT_KEYS = new Set([
  "dimensions",
  "aspect_ratio",
  "package_type",
  "pack_format",
]);

const HEADLINE_KEYS = new Set(["exact_headline", "exact_wording", "headline.exact"]);

type SeriousKind = "size_format" | "logo" | "headline";

function seriousKind(check: CdfValidationCheck): SeriousKind | null {
  const key = check.requirementKey ?? "";
  if (
    SIZE_FORMAT_KEYS.has(key) ||
    check.verificationType === "dimensions" ||
    check.verificationType === "aspect_ratio"
  ) {
    return "size_format";
  }
  if (key === "required_logo" || key.startsWith("reference.")) return "logo";
  if (HEADLINE_KEYS.has(key)) return "headline";
  return null;
}

export function qualityAttemptFromMetadata(
  metadata: Record<string, unknown> | undefined,
): number {
  const raw = metadata?.cdfQualityAttempt;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function applyRequirementCheckLeniency(
  checks: CdfValidationCheck[],
  input: { artifactKey: string; qualityAttempt?: number },
): CdfValidationCheck[] {
  const observable = OBSERVABLE_ARTIFACT_PREFIXES.some((p) =>
    input.artifactKey.startsWith(p),
  );
  const finalAttempt = (input.qualityAttempt ?? 1) >= CDF_QUALITY_MAX_ATTEMPTS;

  return checks.map((check) => {
    if (check.severity !== "blocking") return check;
    const kind = seriousKind(check);
    const stillBlocks =
      observable &&
      kind != null &&
      !(kind === "size_format" && finalAttempt);
    if (stillBlocks) return check;
    return {
      ...check,
      severity: "warning",
      evidence: `${check.evidence} (non-blocking: ${
        !observable
          ? "not observable on this artifact"
          : kind === "size_format"
            ? "final attempt"
            : "minor requirement"
      })`,
    };
  });
}
