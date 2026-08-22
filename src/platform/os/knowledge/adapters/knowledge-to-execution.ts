/**
 * Adapt KnowledgeContext → execution metadata (no document bodies).
 */

import type { KnowledgeContext } from "../contracts/knowledge-context";

export function knowledgeContextToMetadata(
  ctx: KnowledgeContext
): Readonly<Record<string, unknown>> {
  return {
    structuredKnowledgeContext: ctx,
    knowledgeContextId: ctx.id,
    knowledgeContextStatus: ctx.status,
    knowledgeContextHash: ctx.contextHash,
    knowledgeVersion: ctx.knowledgeVersion,
    knowledgeSourceReferences: ctx.sourceReferences,
    knowledgeFactKeys: ctx.facts.map((f) => f.key),
    knowledgeConflictCount: ctx.conflicts.length,
    knowledgeAware: true,
  };
}
