/**
 * Step 13 — Mongo-backed adaptive routing decision store (append-only audit).
 */

import type {
  AdaptiveRoutingDecision,
  AdaptiveRoutingDecisionQuery,
} from "./adaptive-routing-decision-contract";
import type { IAdaptiveRoutingDecisionStore } from "./adaptive-routing-decision-store";
import { EnterpriseAdaptiveRoutingDecision } from "../../../../../infrastructure/durability/mongo/models/enterprise-adaptive-routing-decision.model";

export class MongoAdaptiveRoutingDecisionStore implements IAdaptiveRoutingDecisionStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoAdaptiveRoutingDecisionStore.indexesReady) {
      MongoAdaptiveRoutingDecisionStore.indexesReady =
        EnterpriseAdaptiveRoutingDecision.createIndexes().then(() => undefined);
    }
    return MongoAdaptiveRoutingDecisionStore.indexesReady;
  }

  async append(decision: AdaptiveRoutingDecision): Promise<"inserted" | "duplicate"> {
    await MongoAdaptiveRoutingDecisionStore.ensureIndexes();
    try {
      await EnterpriseAdaptiveRoutingDecision.create({ ...decision });
      return "inserted";
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) return "duplicate";
      throw err;
    }
  }

  async get(decisionId: string): Promise<AdaptiveRoutingDecision | undefined> {
    await MongoAdaptiveRoutingDecisionStore.ensureIndexes();
    const doc = await EnterpriseAdaptiveRoutingDecision.findOne({ decisionId }).lean();
    return doc ? (doc as unknown as AdaptiveRoutingDecision) : undefined;
  }

  async query(query?: AdaptiveRoutingDecisionQuery): Promise<readonly AdaptiveRoutingDecision[]> {
    await MongoAdaptiveRoutingDecisionStore.ensureIndexes();
    const filter: Record<string, unknown> = {};
    if (query?.requestId) filter.requestId = query.requestId;
    if (query?.executionId) filter.executionId = query.executionId;
    if (query?.service) filter["scope.service"] = query.service;
    if (query?.decision) filter.decision = query.decision;
    if (query?.sinceIso) filter.timestamp = { $gte: query.sinceIso };
    const docs = await EnterpriseAdaptiveRoutingDecision.find(filter)
      .sort({ timestamp: -1 })
      .limit(query?.limit ?? 1000)
      .lean();
    return docs as unknown as AdaptiveRoutingDecision[];
  }
}
