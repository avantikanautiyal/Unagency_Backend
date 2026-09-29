/**
 * Phase 19 — Failure containment + integrity assertions (pure checks).
 */

import type { CanonicalOutputQAResult } from "../output-qa";
import type { CanonicalRepairResult } from "../repair";
import type { FailureContainmentExpectation } from "./types";

export const STANDARD_FAILURE_CONTAINMENT: FailureContainmentExpectation = {
  failurePoint: "generic",
  typedErrorRequired: true,
  noPartialUnsafeMutation: true,
  noSilentFallback: true,
  noCdfAdvancementOnRequiredFailure: true,
  noApprovalMutation: true,
  noArtifactCorruption: true,
  safeTrace: true,
};

export const FAILURE_POINTS = [
  "action_registry",
  "action_execution",
  "authorization",
  "context_orchestrator",
  "artifact_resolution",
  "reference_resolution",
  "working_memory",
  "multimodal_delivery",
  "cmr_assembly",
  "model_runtime",
  "provider",
  "output_qa",
  "repair",
] as const;

export type FailurePoint = (typeof FAILURE_POINTS)[number];

export function containmentFor(point: FailurePoint): FailureContainmentExpectation {
  return { ...STANDARD_FAILURE_CONTAINMENT, failurePoint: point };
}

/** INVALID required output must not advance. */
export function assertNoAdvancementOnInvalidQa(
  qa: CanonicalOutputQAResult,
): void {
  if (qa.status === "INVALID" && qa.mayAdvance) {
    throw new Error("INVALID Output QA must not set mayAdvance=true");
  }
}

/** UNSUPPORTED must not silently become VALID via repair. */
export function assertRepairDoesNotValidateUnsupported(
  qa: CanonicalOutputQAResult,
  repair?: CanonicalRepairResult,
): void {
  if (qa.status !== "UNSUPPORTED") return;
  if (repair?.finalQa?.status === "VALID") {
    throw new Error("Repair must not convert UNSUPPORTED → VALID");
  }
  if (repair?.ok && repair.status === "REPAIRED") {
    throw new Error("Repair must not claim REPAIRED for UNSUPPORTED QA");
  }
}

/** Exact version pin — reject latest/HEAD tokens. */
export function assertExactVersionPin(versionRef: string): void {
  const lower = versionRef.toLowerCase();
  if (
    lower.includes("@latest") ||
    lower.endsWith("/latest") ||
    lower.includes("@head") ||
    lower === "latest" ||
    lower === "head"
  ) {
    throw new Error(`Forbidden latest/HEAD substitution: ${versionRef}`);
  }
}

export function assertExactArtifactVersionMatch(input: {
  readonly expectedArtifactId: string;
  readonly expectedVersion: number;
  readonly observedPins: readonly string[];
}): void {
  const pin = `${input.expectedArtifactId}@${input.expectedVersion}`;
  assertExactVersionPin(pin);
  if (!input.observedPins.includes(pin)) {
    throw new Error(
      `Expected exact pin ${pin}; observed ${input.observedPins.join(",")}`,
    );
  }
  for (const obs of input.observedPins) {
    if (
      obs.startsWith(`${input.expectedArtifactId}@`) &&
      obs !== pin
    ) {
      throw new Error(
        `Unexpected version substitution for ${input.expectedArtifactId}: ${obs}`,
      );
    }
  }
}

/** Trace details must omit sensitive bodies. */
export function assertTraceDetailsSafe(
  details: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!details) return;
  const json = JSON.stringify(details);
  if (/("prompt"|signedUrl|secret|apiKey|conversationBody|rawPrompt)/i.test(json)) {
    throw new Error("Trace details contain sensitive field names");
  }
}

export function assertFlagsRemainDefaultOff(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const gen = env.CDF_CANONICAL_GENERATION_CONTEXT;
  const repair = env.CDF_CANONICAL_AUTOMATIC_REPAIR;
  if (gen === "1" || gen === "true") {
    throw new Error("CDF_CANONICAL_GENERATION_CONTEXT unexpectedly ON");
  }
  if (repair === "1" || repair === "true") {
    throw new Error("CDF_CANONICAL_AUTOMATIC_REPAIR unexpectedly ON");
  }
}
