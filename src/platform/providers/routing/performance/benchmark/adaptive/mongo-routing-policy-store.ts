/**
 * Step 13 — Mongo-backed adaptive routing policy store.
 */

import type {
  AdaptiveRoutingPolicy,
  RoutingPolicyQuery,
} from "./routing-policy-contract";
import type { IRoutingPolicyStore } from "./routing-policy-store";
import { EnterpriseAdaptiveRoutingPolicy } from "../../../../../infrastructure/durability/mongo/models/enterprise-adaptive-routing-policy.model";

export class MongoRoutingPolicyStore implements IRoutingPolicyStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoRoutingPolicyStore.indexesReady) {
      MongoRoutingPolicyStore.indexesReady =
        EnterpriseAdaptiveRoutingPolicy.createIndexes().then(() => undefined);
    }
    return MongoRoutingPolicyStore.indexesReady;
  }

  async save(policy: AdaptiveRoutingPolicy): Promise<void> {
    await MongoRoutingPolicyStore.ensureIndexes();
    await EnterpriseAdaptiveRoutingPolicy.findOneAndUpdate(
      { policyId: policy.policyId },
      { $set: { ...policy } },
      { upsert: true, new: true },
    );
  }

  async get(policyId: string): Promise<AdaptiveRoutingPolicy | undefined> {
    await MongoRoutingPolicyStore.ensureIndexes();
    const doc = await EnterpriseAdaptiveRoutingPolicy.findOne({ policyId }).lean();
    return doc ? (doc as unknown as AdaptiveRoutingPolicy) : undefined;
  }

  async query(query?: RoutingPolicyQuery): Promise<readonly AdaptiveRoutingPolicy[]> {
    await MongoRoutingPolicyStore.ensureIndexes();
    const filter: Record<string, unknown> = {};
    if (query?.policyId) filter.policyId = query.policyId;
    if (query?.lifecycle) filter.lifecycle = query.lifecycle;
    if (query?.service) filter["scope.service"] = query.service;
    if (query?.industry) filter["scope.industry"] = query.industry;
    if (query?.enabled != null) filter.enabled = query.enabled;
    const docs = await EnterpriseAdaptiveRoutingPolicy.find(filter)
      .sort({ createdAt: -1 })
      .limit(query?.limit ?? 1000)
      .lean();
    return docs as unknown as AdaptiveRoutingPolicy[];
  }
}
