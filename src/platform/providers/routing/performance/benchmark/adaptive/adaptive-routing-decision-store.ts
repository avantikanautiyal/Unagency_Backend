/**
 * Step 12 — Adaptive routing decision store.
 */

import type {
  AdaptiveRoutingDecision,
  AdaptiveRoutingDecisionQuery,
} from "./adaptive-routing-decision-contract";

export interface IAdaptiveRoutingDecisionStore {
  append(decision: AdaptiveRoutingDecision): Promise<"inserted" | "duplicate">;
  get(decisionId: string): Promise<AdaptiveRoutingDecision | undefined>;
  query(query?: AdaptiveRoutingDecisionQuery): Promise<readonly AdaptiveRoutingDecision[]>;
}

export class InMemoryAdaptiveRoutingDecisionStore implements IAdaptiveRoutingDecisionStore {
  private readonly byId = new Map<string, AdaptiveRoutingDecision>();
  private readonly ordered: AdaptiveRoutingDecision[] = [];

  async append(decision: AdaptiveRoutingDecision): Promise<"inserted" | "duplicate"> {
    if (this.byId.has(decision.decisionId)) return "duplicate";
    this.byId.set(decision.decisionId, decision);
    this.ordered.push(decision);
    return "inserted";
  }

  async get(decisionId: string): Promise<AdaptiveRoutingDecision | undefined> {
    return this.byId.get(decisionId);
  }

  async query(query?: AdaptiveRoutingDecisionQuery): Promise<readonly AdaptiveRoutingDecision[]> {
    let rows = [...this.ordered];
    if (query?.requestId) rows = rows.filter((r) => r.requestId === query.requestId);
    if (query?.executionId) rows = rows.filter((r) => r.executionId === query.executionId);
    if (query?.service) rows = rows.filter((r) => r.scope.service === query.service);
    if (query?.decision) rows = rows.filter((r) => r.decision === query.decision);
    if (query?.sinceIso) rows = rows.filter((r) => r.timestamp >= query.sinceIso!);
    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return rows.slice(0, query?.limit ?? 1000);
  }

  clear(): void {
    this.byId.clear();
    this.ordered.length = 0;
  }
}

export const defaultAdaptiveRoutingDecisionStore = new InMemoryAdaptiveRoutingDecisionStore();
