/**
 * Step 11 — Append-only promotion candidate store.
 */

import type { PromotionCandidate, PromotionCandidateQuery } from "./promotion-candidate-contract";

export interface IPromotionCandidateStore {
  save(candidate: PromotionCandidate): Promise<void>;
  get(candidateId: string): Promise<PromotionCandidate | undefined>;
  query(query?: PromotionCandidateQuery): Promise<readonly PromotionCandidate[]>;
}

export class InMemoryPromotionCandidateStore implements IPromotionCandidateStore {
  private readonly byId = new Map<string, PromotionCandidate>();

  async save(candidate: PromotionCandidate): Promise<void> {
    this.byId.set(candidate.candidateId, candidate);
  }

  async get(candidateId: string): Promise<PromotionCandidate | undefined> {
    return this.byId.get(candidateId);
  }

  async query(query?: PromotionCandidateQuery): Promise<readonly PromotionCandidate[]> {
    let rows = [...this.byId.values()];
    if (query?.candidateId) rows = rows.filter((r) => r.candidateId === query.candidateId);
    if (query?.lifecycle) rows = rows.filter((r) => r.lifecycle === query.lifecycle);
    if (query?.service) rows = rows.filter((r) => r.scope.service === query.service);
    if (query?.industry) rows = rows.filter((r) => r.scope.industry === query.industry);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows.slice(0, query?.limit ?? 1000);
  }

  clear(): void {
    this.byId.clear();
  }
}

export const defaultPromotionCandidateStore = new InMemoryPromotionCandidateStore();
