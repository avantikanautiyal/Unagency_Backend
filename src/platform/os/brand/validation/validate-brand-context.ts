/**
 * Deterministic BrandContext validation.
 */

import {
  BRAND_CONTEXT_VERSION,
  type BrandContext,
  type BrandContextStatus,
} from "../contracts/brand-context";
import { BrandIntelligenceError } from "../contracts/errors";

const STATUSES: readonly BrandContextStatus[] = [
  "READY",
  "PARTIAL",
  "EMPTY",
  "MISSING",
  "INVALID",
];

export function validateBrandContext(ctx: BrandContext): BrandContext {
  const issues: string[] = [];
  if (!ctx.id?.trim()) issues.push("id required");
  if (ctx.version !== BRAND_CONTEXT_VERSION) {
    issues.push(`version must be ${BRAND_CONTEXT_VERSION}`);
  }
  if (!ctx.organizationId?.trim()) issues.push("organizationId required");
  if (!ctx.executionId?.trim()) issues.push("executionId required");
  if (!ctx.brandVersion?.trim()) issues.push("brandVersion required");
  if (!STATUSES.includes(ctx.status)) issues.push("status invalid");
  if (
    typeof ctx.confidence?.system !== "number" ||
    ctx.confidence.system < 0 ||
    ctx.confidence.system > 1
  ) {
    issues.push("confidence.system must be 0..1");
  }
  if (!ctx.contextHash?.trim()) issues.push("contextHash required");
  if (!ctx.contextGeneratedAt?.trim()) issues.push("contextGeneratedAt required");

  if (issues.length) {
    throw new BrandIntelligenceError(
      "BRAND_CONTEXT_INVALID",
      `BrandContext validation failed: ${issues.join("; ")}`,
      { issues }
    );
  }
  return ctx;
}
