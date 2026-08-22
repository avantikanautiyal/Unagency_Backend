/**
 * Deterministic KnowledgeContext validation.
 */

import {
  KNOWLEDGE_CONTEXT_VERSION,
  type KnowledgeContext,
  type KnowledgeContextStatus,
} from "../contracts/knowledge-context";
import { KnowledgeIntelligenceError } from "../contracts/errors";

const STATUSES: readonly KnowledgeContextStatus[] = [
  "READY",
  "PARTIAL",
  "EMPTY",
  "MISSING",
  "CONFLICTED",
  "FAILED",
];

export function validateKnowledgeContext(ctx: KnowledgeContext): KnowledgeContext {
  const issues: string[] = [];
  if (!ctx.id?.trim()) issues.push("id required");
  if (ctx.version !== KNOWLEDGE_CONTEXT_VERSION) {
    issues.push(`version must be ${KNOWLEDGE_CONTEXT_VERSION}`);
  }
  if (!ctx.organizationId?.trim()) issues.push("organizationId required");
  if (!ctx.executionId?.trim()) issues.push("executionId required");
  if (!STATUSES.includes(ctx.status)) issues.push("status invalid");
  if (
    typeof ctx.confidence?.system !== "number" ||
    ctx.confidence.system < 0 ||
    ctx.confidence.system > 1
  ) {
    issues.push("confidence.system must be 0..1");
  }
  if (!ctx.contextHash?.trim()) issues.push("contextHash required");
  if (!ctx.retrievedAt?.trim()) issues.push("retrievedAt required");

  for (const chunk of ctx.retrievedChunks ?? []) {
    if (!chunk.chunkId?.trim()) issues.push("chunk.chunkId required");
    if (
      typeof chunk.retrievalScore !== "number" ||
      !Number.isFinite(chunk.retrievalScore)
    ) {
      issues.push("chunk.retrievalScore must be finite");
    }
  }

  if (issues.length) {
    throw new KnowledgeIntelligenceError(
      "KNOWLEDGE_CONTEXT_INVALID",
      `KnowledgeContext validation failed: ${issues.join("; ")}`,
      { issues }
    );
  }
  return ctx;
}
