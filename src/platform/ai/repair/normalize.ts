/**
 * Phase 17 — Deterministic normalization (offline; no Model Runtime).
 * Reuses existing coerce / presentation validators — does not invent fields.
 */

import { coerceValueTowardJsonSchema } from "../../providers/tools/structured/structured-output-coerce";
import { validatePresentationArtifactData } from "../../cdf/artifacts/presentation/validate";
import { PRESENTATION_ARTIFACT_KEYS } from "../../cdf/artifacts/presentation/keys";
import type { OutputQAErrorCode } from "../output-qa";

export type DeterministicNormalizeResult =
  | {
      readonly ok: true;
      readonly data: Record<string, unknown>;
      readonly method: "coerceValueTowardJsonSchema" | "identity_valid";
    }
  | {
      readonly ok: false;
      readonly code: "REPAIR_NOT_SUPPORTED" | "REPAIR_UNSAFE";
      readonly message: string;
    };

/**
 * Attempt offline repair of candidate structured data.
 * Does not invent missing semantic content — only safe coerce toward schema when possible.
 * If still invalid after coerce, fails closed.
 */
export function attemptDeterministicNormalization(input: {
  readonly data: Record<string, unknown>;
  readonly artifactKey?: string;
  readonly jsonSchema?: Record<string, unknown>;
}): DeterministicNormalizeResult {
  const key = input.artifactKey;

  // If already valid under presentation validator, identity pass
  if (key && Object.values(PRESENTATION_ARTIFACT_KEYS).includes(key as never)) {
    const before = validatePresentationArtifactData(key as never, input.data);
    if (before.ok) {
      return { ok: true, data: input.data, method: "identity_valid" };
    }
  }

  if (!input.jsonSchema) {
    // Without a JSON schema, we cannot safely invent fields — fail closed
    return {
      ok: false,
      code: "REPAIR_NOT_SUPPORTED",
      message:
        "Deterministic normalization requires a JSON schema or already-valid data",
    };
  }

  const coerced = coerceValueTowardJsonSchema(input.data, input.jsonSchema);
  if (!coerced || typeof coerced !== "object" || Array.isArray(coerced)) {
    return {
      ok: false,
      code: "REPAIR_UNSAFE",
      message: "Coercion did not produce a plain object",
    };
  }

  const data = coerced as Record<string, unknown>;
  if (key && Object.values(PRESENTATION_ARTIFACT_KEYS).includes(key as never)) {
    const after = validatePresentationArtifactData(key as never, data);
    if (!after.ok) {
      return {
        ok: false,
        code: "REPAIR_UNSAFE",
        message: `Post-coerce schema still invalid: ${after.message}`,
      };
    }
  }

  return { ok: true, data, method: "coerceValueTowardJsonSchema" };
}

export function qaCodesFromNormalizeFailure(
  _message: string,
): OutputQAErrorCode[] {
  return ["OUTPUT_SCHEMA_INVALID"];
}
