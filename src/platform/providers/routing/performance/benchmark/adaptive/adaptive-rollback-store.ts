/**
 * Step 13 — Durable adaptive rollback event store.
 */

import type { AdaptiveRollbackEvent } from "../../../../../infrastructure/durability/mongo/models/enterprise-adaptive-routing-rollback.model";
import { EnterpriseAdaptiveRoutingRollback } from "../../../../../infrastructure/durability/mongo/models/enterprise-adaptive-routing-rollback.model";

export interface IAdaptiveRollbackStore {
  append(event: AdaptiveRollbackEvent): Promise<"inserted" | "duplicate">;
  query(input?: {
    readonly policyId?: string;
    readonly sinceIso?: string;
    readonly limit?: number;
  }): Promise<readonly AdaptiveRollbackEvent[]>;
}

export class InMemoryAdaptiveRollbackStore implements IAdaptiveRollbackStore {
  private readonly events: AdaptiveRollbackEvent[] = [];

  async append(event: AdaptiveRollbackEvent): Promise<"inserted" | "duplicate"> {
    if (this.events.some((e) => e.rollbackId === event.rollbackId)) return "duplicate";
    this.events.push(event);
    return "inserted";
  }

  async query(input?: {
    readonly policyId?: string;
    readonly sinceIso?: string;
    readonly limit?: number;
  }): Promise<readonly AdaptiveRollbackEvent[]> {
    let rows = [...this.events];
    if (input?.policyId) rows = rows.filter((r) => r.policyId === input.policyId);
    if (input?.sinceIso) rows = rows.filter((r) => r.timestamp >= input!.sinceIso!);
    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return rows.slice(0, input?.limit ?? 1000);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export class MongoAdaptiveRollbackStore implements IAdaptiveRollbackStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoAdaptiveRollbackStore.indexesReady) {
      MongoAdaptiveRollbackStore.indexesReady =
        EnterpriseAdaptiveRoutingRollback.createIndexes().then(() => undefined);
    }
    return MongoAdaptiveRollbackStore.indexesReady;
  }

  async append(event: AdaptiveRollbackEvent): Promise<"inserted" | "duplicate"> {
    await MongoAdaptiveRollbackStore.ensureIndexes();
    try {
      await EnterpriseAdaptiveRoutingRollback.create({ ...event });
      return "inserted";
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) return "duplicate";
      throw err;
    }
  }

  async query(input?: {
    readonly policyId?: string;
    readonly sinceIso?: string;
    readonly limit?: number;
  }): Promise<readonly AdaptiveRollbackEvent[]> {
    await MongoAdaptiveRollbackStore.ensureIndexes();
    const filter: Record<string, unknown> = {};
    if (input?.policyId) filter.policyId = input.policyId;
    if (input?.sinceIso) filter.timestamp = { $gte: input.sinceIso };
    const docs = await EnterpriseAdaptiveRoutingRollback.find(filter)
      .sort({ timestamp: -1 })
      .limit(input?.limit ?? 1000)
      .lean();
    return docs as unknown as AdaptiveRollbackEvent[];
  }
}

export const defaultAdaptiveRollbackStore = new InMemoryAdaptiveRollbackStore();
