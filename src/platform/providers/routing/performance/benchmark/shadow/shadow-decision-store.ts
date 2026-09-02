/**
 * Step 10 — Append-only shadow decision store.
 */

import type { ShadowDecision, ShadowDecisionQuery } from "./shadow-decision-contract";

export interface IShadowDecisionStore {
  append(decision: ShadowDecision): Promise<"inserted" | "duplicate">;
  get(shadowDecisionId: string): Promise<ShadowDecision | undefined>;
  query(query: ShadowDecisionQuery): Promise<readonly ShadowDecision[]>;
  count(query?: ShadowDecisionQuery): Promise<number>;
}

export class InMemoryShadowDecisionStore implements IShadowDecisionStore {
  private readonly byId = new Map<string, ShadowDecision>();
  private readonly ordered: ShadowDecision[] = [];

  async append(decision: ShadowDecision): Promise<"inserted" | "duplicate"> {
    if (this.byId.has(decision.shadowDecisionId)) return "duplicate";
    this.byId.set(decision.shadowDecisionId, decision);
    this.ordered.push(decision);
    return "inserted";
  }

  async get(shadowDecisionId: string): Promise<ShadowDecision | undefined> {
    return this.byId.get(shadowDecisionId);
  }

  async query(query: ShadowDecisionQuery): Promise<readonly ShadowDecision[]> {
    let rows = [...this.ordered];
    if (query.productionExecutionId) {
      rows = rows.filter((r) => r.productionExecutionId === query.productionExecutionId);
    }
    if (query.service) rows = rows.filter((r) => r.recommendationScope.includes(query.service!));
    if (query.industry && query.industry) {
      rows = rows.filter((r) => r.recommendationScope.includes(query.industry!));
    }
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    if (query.sinceIso) rows = rows.filter((r) => r.decisionTimestamp >= query.sinceIso!);
    rows.sort((a, b) => (a.decisionTimestamp < b.decisionTimestamp ? 1 : -1));
    return rows.slice(0, query.limit ?? 1000);
  }

  async count(query?: ShadowDecisionQuery): Promise<number> {
    const rows = query ? await this.query({ ...query, limit: 100_000 }) : this.ordered;
    return rows.length;
  }

  clear(): void {
    this.byId.clear();
    this.ordered.length = 0;
  }
}

export const defaultShadowDecisionStore = new InMemoryShadowDecisionStore();
