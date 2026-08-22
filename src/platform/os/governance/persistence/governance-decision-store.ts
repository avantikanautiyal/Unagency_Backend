/**
 * Phase 8 — Durable governance decision ledger (immutable).
 */

import type { OsGovernanceDecision } from "../governance-engine";

export interface IGovernanceDecisionStore {
  append(decision: OsGovernanceDecision): Promise<OsGovernanceDecision>;
  get(
    decisionId: string,
    organizationId: string
  ): Promise<OsGovernanceDecision | undefined>;
  listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly OsGovernanceDecision[]>;
}

export class InMemoryGovernanceDecisionStore implements IGovernanceDecisionStore {
  private readonly byId = new Map<string, OsGovernanceDecision>();

  clear(): void {
    this.byId.clear();
  }

  async append(decision: OsGovernanceDecision): Promise<OsGovernanceDecision> {
    const existing = this.byId.get(decision.decisionId);
    if (existing) {
      if (existing.organizationId !== decision.organizationId) {
        throw new Error("GOVERNANCE_TENANT_VIOLATION");
      }
      return existing;
    }
    this.byId.set(decision.decisionId, decision);
    return decision;
  }

  async get(
    decisionId: string,
    organizationId: string
  ): Promise<OsGovernanceDecision | undefined> {
    const d = this.byId.get(decisionId);
    if (!d || d.organizationId !== organizationId) return undefined;
    return d;
  }

  async listByExecution(
    executionId: string,
    organizationId: string
  ): Promise<readonly OsGovernanceDecision[]> {
    return [...this.byId.values()].filter(
      (d) => d.executionId === executionId && d.organizationId === organizationId
    );
  }
}
