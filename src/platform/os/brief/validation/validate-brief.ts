/**
 * Deterministic StructuredBrief validation — never trust unchecked JSON.
 */

import {
  BRIEF_RUNTIME_CAPABILITY_IDS,
  STRUCTURED_BRIEF_VERSION,
  type BriefRuntimeCapabilityId,
  type BriefStatus,
  type StructuredBrief,
} from "../contracts/structured-brief";
import { BriefIntelligenceError } from "../contracts/errors";

const STATUSES: readonly BriefStatus[] = [
  "VALID",
  "NEEDS_INFORMATION",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "INVALID",
];

const INTENTS = new Set([
  "campaign",
  "landing_page",
  "website",
  "social_content",
  "advertisement",
  "copy",
  "image",
  "video",
  "audio",
  "research",
  "document",
  "analysis",
  "embedding",
  "other",
]);

const CAP_SET = new Set<string>(BRIEF_RUNTIME_CAPABILITY_IDS);

export function isBriefRuntimeCapabilityId(
  value: string
): value is BriefRuntimeCapabilityId {
  return CAP_SET.has(value);
}

export function validateStructuredBrief(brief: StructuredBrief): StructuredBrief {
  const issues: string[] = [];

  if (!brief.id?.trim()) issues.push("id required");
  if (brief.version !== STRUCTURED_BRIEF_VERSION) {
    issues.push(`version must be ${STRUCTURED_BRIEF_VERSION}`);
  }
  if (!brief.executionId?.trim()) issues.push("executionId required");
  if (!brief.organizationId?.trim()) issues.push("organizationId required");
  if (!brief.requestId?.trim()) issues.push("requestId required");
  if (!brief.sourceRequest?.promptPreview?.trim()) {
    issues.push("sourceRequest.promptPreview required");
  }
  if (!INTENTS.has(brief.intent?.kind)) issues.push("intent.kind invalid");
  if (
    typeof brief.intent?.confidence !== "number" ||
    brief.intent.confidence < 0 ||
    brief.intent.confidence > 1
  ) {
    issues.push("intent.confidence must be 0..1");
  }
  if (!brief.objective?.trim()) issues.push("objective required");
  if (!Array.isArray(brief.deliverables) || brief.deliverables.length === 0) {
    issues.push("deliverables must be non-empty");
  }
  if (!Array.isArray(brief.requiredCapabilities) || brief.requiredCapabilities.length === 0) {
    issues.push("requiredCapabilities must be non-empty");
  } else {
    for (const c of brief.requiredCapabilities) {
      if (!isBriefRuntimeCapabilityId(c.capabilityId)) {
        issues.push(`invalid capabilityId: ${c.capabilityId}`);
      }
    }
  }
  if (!STATUSES.includes(brief.status)) issues.push("status invalid");
  if (
    typeof brief.confidence?.system !== "number" ||
    brief.confidence.system < 0 ||
    brief.confidence.system > 1
  ) {
    issues.push("confidence.system must be 0..1");
  }
  if (
    typeof brief.confidence?.extraction !== "number" ||
    brief.confidence.extraction < 0 ||
    brief.confidence.extraction > 1
  ) {
    issues.push("confidence.extraction must be 0..1");
  }

  for (const d of brief.deliverables ?? []) {
    if (!d.id?.trim()) issues.push("deliverable.id required");
    if (!d.type) issues.push("deliverable.type required");
    if (d.quantity != null && (!Number.isFinite(d.quantity) || d.quantity < 1)) {
      issues.push("deliverable.quantity must be >= 1 when set");
    }
  }

  if (issues.length) {
    throw new BriefIntelligenceError(
      "BRIEF_VALIDATION_FAILED",
      `StructuredBrief validation failed: ${issues.join("; ")}`,
      { issues }
    );
  }

  return brief;
}
