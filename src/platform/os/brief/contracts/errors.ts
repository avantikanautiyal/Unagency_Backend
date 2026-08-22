/**
 * Brief Intelligence error codes — client-safe, no provider secrets.
 */

export type BriefErrorCode =
  | "BRIEF_INVALID"
  | "BRIEF_UNSUPPORTED"
  | "BRIEF_NEEDS_INFORMATION"
  | "BRIEF_GENERATION_FAILED"
  | "BRIEF_VALIDATION_FAILED"
  | "BRIEF_CONTEXT_UNAVAILABLE";

export class BriefIntelligenceError extends Error {
  constructor(
    readonly code: BriefErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "BriefIntelligenceError";
  }
}
