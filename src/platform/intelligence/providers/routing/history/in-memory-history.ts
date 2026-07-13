/**
 * In-memory routing history.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type { RoutingHistory, RoutingHistoryEntry } from "../contracts/plan";
import type { IRoutingHistory } from "../interfaces/routing";

export class InMemoryRoutingHistory implements IRoutingHistory {
  private readonly entries: RoutingHistoryEntry[] = [];

  record(entry: RoutingHistoryEntry): void {
    this.entries.push(entry);
  }

  forCapability(capabilityId: CapabilityId): RoutingHistory {
    return {
      capabilityId,
      entries: this.entries.filter((e) => e.capabilityId === capabilityId),
    };
  }

  qualityScore(providerId: ProviderId, capabilityId: CapabilityId): number {
    const relevant = this.entries.filter(
      (e) =>
        e.providerId === providerId &&
        e.capabilityId === capabilityId &&
        e.qualityScore !== undefined
    );
    if (relevant.length === 0) return 0.5;
    const sum = relevant.reduce((a, e) => a + (e.qualityScore ?? 0), 0);
    return sum / relevant.length;
  }

  latencyScore(providerId: ProviderId, capabilityId: CapabilityId): number {
    const relevant = this.entries.filter(
      (e) =>
        e.providerId === providerId &&
        e.capabilityId === capabilityId &&
        e.latencyMs !== undefined
    );
    if (relevant.length === 0) return 0.5;
    const avg =
      relevant.reduce((a, e) => a + (e.latencyMs ?? 0), 0) / relevant.length;
    return Math.max(0, Math.min(1, 1 - avg / 10_000));
  }
}
