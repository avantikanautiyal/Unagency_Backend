/**
 * Step 12 — Routing policy store.
 */

import type { AdaptiveRoutingPolicy, RoutingPolicyQuery } from "./routing-policy-contract";

export interface IRoutingPolicyStore {
  save(policy: AdaptiveRoutingPolicy): Promise<void>;
  get(policyId: string): Promise<AdaptiveRoutingPolicy | undefined>;
  query(query?: RoutingPolicyQuery): Promise<readonly AdaptiveRoutingPolicy[]>;
}

export class InMemoryRoutingPolicyStore implements IRoutingPolicyStore {
  private readonly byId = new Map<string, AdaptiveRoutingPolicy>();

  async save(policy: AdaptiveRoutingPolicy): Promise<void> {
    this.byId.set(policy.policyId, policy);
  }

  async get(policyId: string): Promise<AdaptiveRoutingPolicy | undefined> {
    return this.byId.get(policyId);
  }

  async query(query?: RoutingPolicyQuery): Promise<readonly AdaptiveRoutingPolicy[]> {
    let rows = [...this.byId.values()];
    if (query?.policyId) rows = rows.filter((r) => r.policyId === query.policyId);
    if (query?.lifecycle) rows = rows.filter((r) => r.lifecycle === query.lifecycle);
    if (query?.service) rows = rows.filter((r) => r.scope.service === query.service);
    if (query?.industry) rows = rows.filter((r) => r.scope.industry === query.industry);
    if (query?.enabled != null) rows = rows.filter((r) => r.enabled === query.enabled);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows.slice(0, query?.limit ?? 1000);
  }

  clear(): void {
    this.byId.clear();
  }
}

export const defaultRoutingPolicyStore = new InMemoryRoutingPolicyStore();
