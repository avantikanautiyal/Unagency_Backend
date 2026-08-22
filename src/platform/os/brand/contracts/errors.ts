/**
 * Brand Intelligence error codes — client-safe.
 */

export type BrandIntelligenceErrorCode =
  | "BRAND_INVALID"
  | "BRAND_MISSING"
  | "BRAND_TENANT_VIOLATION"
  | "BRAND_CONTEXT_INVALID"
  | "BRAND_CONTEXT_FAILED"
  | "BRAND_SPOOF_REJECTED";

export class BrandIntelligenceError extends Error {
  constructor(
    readonly code: BrandIntelligenceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "BrandIntelligenceError";
  }
}
