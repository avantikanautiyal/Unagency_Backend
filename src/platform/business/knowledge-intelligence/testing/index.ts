/**
 * Knowledge Intelligence testing helpers.
 */

import {
  createKnowledgeIntelligencePlatform,
  type CreateKnowledgeIntelligenceOptions,
  type KnowledgeIntelligencePlatform,
} from "../factories/create-knowledge-intelligence-platform";
import { sampleBrandBrain } from "../../brand-brain/builders/sample-brand-brain";
import {
  KnowledgeRetrievalBuilder,
  KnowledgeSyncBuilder,
} from "../builders/knowledge-builders";

export function deterministicKnowledgeHelpers() {
  let id = 0;
  let ms = 40_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => (ms += 17),
  };
}

export function setupKnowledgeIntelligence(
  options: CreateKnowledgeIntelligenceOptions = {}
): KnowledgeIntelligencePlatform {
  const h = deterministicKnowledgeHelpers();
  return createKnowledgeIntelligencePlatform({
    createId: h.createId,
    nowIso: h.nowIso,
    clockMs: h.clockMs,
    ...options,
  });
}

export { sampleBrandBrain, KnowledgeRetrievalBuilder, KnowledgeSyncBuilder };
