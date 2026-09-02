/**
 * Step 10 — Default shadow candidate pool from Step 9 catalogs.
 */

import { listExperimentStrategies } from "../experiment/catalog/strategy-catalog";
import { listKnowledgeContexts } from "../experiment/catalog/knowledge-catalog";
import { knowledgeVersionTag } from "../experiment/contracts/knowledge-context";
import type { ShadowCandidateRef } from "./shadow-decision-contract";

export function buildDefaultShadowCandidatePool(input?: {
  readonly providerIds?: readonly string[];
  readonly modelIds?: readonly string[];
}): readonly ShadowCandidateRef[] {
  const providers = input?.providerIds ?? ["provider.openai", "provider.anthropic"];
  const models =
    input?.modelIds ?? ["openai/gpt-4o", "anthropic/claude-sonnet-4-5"];
  const strategies = listExperimentStrategies();
  const knowledge = listKnowledgeContexts();

  const pool: ShadowCandidateRef[] = [];
  for (const providerId of providers) {
    for (const modelId of models) {
      for (const strategy of strategies) {
        for (const k of knowledge) {
          pool.push(
            Object.freeze({
              providerId,
              modelId,
              strategyId: strategy.strategyId,
              strategyVersion: strategy.version,
              knowledgeId: k.knowledgeId,
              knowledgeVersion: knowledgeVersionTag(k),
              knowledgeFingerprint: k.contentFingerprint,
            }),
          );
        }
      }
    }
  }
  return Object.freeze(pool);
}

export function sameShadowCandidate(
  a: ShadowCandidateRef,
  b: ShadowCandidateRef,
): boolean {
  return (
    a.providerId === b.providerId &&
    a.modelId === b.modelId &&
    a.strategyId === b.strategyId &&
    (a.knowledgeId ?? a.knowledgeVersion ?? "") === (b.knowledgeId ?? b.knowledgeVersion ?? "")
  );
}
