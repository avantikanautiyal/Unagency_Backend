/**
 * Phase 13 — Resolve current-turn conversational instruction for canonical CDF.
 * CTI effectiveInstruction must not override explicit CDF user/refine instruction.
 */

export type CanonicalInstructionSource =
  | "refinePrompt"
  | "conversationalCurrentUserInstruction"
  | "none";

export type CanonicalInstructionResolution = {
  /** Authoritative current-turn user instruction, when explicit. */
  readonly instruction?: string;
  readonly source: CanonicalInstructionSource;
  /** CTI rewritten instruction present on metadata (advisory only). */
  readonly ctiEffectivePresent: boolean;
  /** Fingerprint of authoritative instruction (never the full body in logs). */
  readonly instructionFingerprint?: string;
};

function fingerprint(text: string): string {
  // Lightweight stable fingerprint without importing crypto in every call site.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function readTrimmed(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const v = metadata[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Prefer refine / stamped current-turn instruction over CTI effectiveInstruction
 * when assembling canonical CDF generation context.
 *
 * Precedence:
 * 1. refinePrompt
 * 2. conversationalCurrentUserInstruction
 * 3. undefined (CTI effective is NEVER promoted)
 */
export function resolveCanonicalConversationalInstruction(
  metadata: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  return resolveCanonicalConversationalInstructionDetailed(metadata).instruction;
}

/**
 * Same authority as resolveCanonicalConversationalInstruction, with source
 * metadata for diagnostics. Single source of truth — do not re-implement.
 */
export function resolveCanonicalConversationalInstructionDetailed(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CanonicalInstructionResolution {
  if (!metadata) {
    return { source: "none", ctiEffectivePresent: false };
  }
  const ctiEffectivePresent = Boolean(
    readTrimmed(metadata, "conversationalEffectiveInstruction"),
  );
  const refine = readTrimmed(metadata, "refinePrompt");
  if (refine) {
    return {
      instruction: refine,
      source: "refinePrompt",
      ctiEffectivePresent,
      instructionFingerprint: fingerprint(refine),
    };
  }
  const current = readTrimmed(metadata, "conversationalCurrentUserInstruction");
  if (current) {
    return {
      instruction: current,
      source: "conversationalCurrentUserInstruction",
      ctiEffectivePresent,
      instructionFingerprint: fingerprint(current),
    };
  }
  // Intentionally do NOT fall back to conversationalEffectiveInstruction here.
  // That field may be CTI-rewritten; Phase 10/13 keep CDF current instruction explicit.
  return { source: "none", ctiEffectivePresent };
}
