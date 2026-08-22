/**
 * Knowledge Intelligence engine — tenant-safe, task-aware retrieval → KnowledgeContext.
 * Provider-agnostic. Never uses PlaceholderKnowledgeSource / demo knowledge.
 */

import type {
  GetKnowledgeContextInput,
  KnowledgeContext,
} from "../contracts/knowledge-context";
import { emptyKnowledgeContext } from "../contracts/knowledge-context";
import { KnowledgeIntelligenceError } from "../contracts/errors";
import { assembleKnowledgeContext } from "./knowledge-context-assembler";
import { buildKnowledgeQuery } from "./query-builder";
import {
  createProductKnowledgeHitSource,
  type IKnowledgeHitSource,
} from "./knowledge-source";

export interface IKnowledgeIntelligenceOsEngine {
  readonly implementationStatus: "implemented";
  getContext(input: GetKnowledgeContextInput): Promise<KnowledgeContext>;
}

export class KnowledgeIntelligenceOsEngine
  implements IKnowledgeIntelligenceOsEngine
{
  readonly implementationStatus = "implemented" as const;

  constructor(private readonly source: IKnowledgeHitSource) {}

  async getContext(input: GetKnowledgeContextInput): Promise<KnowledgeContext> {
    try {
      if (!input.organizationId?.trim()) {
        throw new KnowledgeIntelligenceError(
          "KNOWLEDGE_INVALID",
          "organizationId is required"
        );
      }
      if (!input.executionId?.trim()) {
        throw new KnowledgeIntelligenceError(
          "KNOWLEDGE_INVALID",
          "executionId is required"
        );
      }

      const query = buildKnowledgeQuery({
        rawPrompt: input.rawPrompt,
        briefIntent: input.briefIntent,
        briefObjective: input.briefObjective,
        deliverableTypes: input.deliverableTypes,
        capabilityId: input.capabilityId,
      });

      if (!query.trim()) {
        return emptyKnowledgeContext({
          organizationId: input.organizationId,
          executionId: input.executionId,
          status: "EMPTY",
          query: "",
          failureReason: "No retrieval query could be constructed",
          nowIso: input.nowIso,
          createId: input.createId,
        });
      }

      const result = await this.source.search({
        organizationId: input.organizationId,
        brandId: input.brandId,
        query,
        limit: 10,
      });

      // Hard tenant filter at engine boundary.
      const safeHits = result.hits.filter(
        (h) => h.organizationId === input.organizationId
      );

      return assembleKnowledgeContext({
        tenant: input,
        query,
        hits: safeHits,
        available: result.available,
        failureReason: result.failureReason,
      });
    } catch (err) {
      if (err instanceof KnowledgeIntelligenceError) throw err;
      throw new KnowledgeIntelligenceError(
        "KNOWLEDGE_CONTEXT_FAILED",
        err instanceof Error ? err.message : "Knowledge context failed"
      );
    }
  }
}

export function createKnowledgeIntelligenceOsEngine(options?: {
  readonly source?: IKnowledgeHitSource;
}): IKnowledgeIntelligenceOsEngine {
  return new KnowledgeIntelligenceOsEngine(
    options?.source ?? createProductKnowledgeHitSource()
  );
}
