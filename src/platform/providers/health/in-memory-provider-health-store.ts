/**
 * In-memory provider health store.
 *
 * Purpose: Track provider health status for registry queries.
 * Responsibilities: get/set/list/clear health reports.
 * Usage: Injected into ProviderRegistry.
 * Future Extension: Probe-driven updates.
 */

import type { ProviderId } from "../../core/identifiers";
import type {
  IProviderHealthStore,
  ProviderHealthReport,
} from "./provider-health";

export class InMemoryProviderHealthStore implements IProviderHealthStore {
  private readonly reports = new Map<string, ProviderHealthReport>();

  get(providerId: ProviderId): ProviderHealthReport | undefined {
    return this.reports.get(String(providerId));
  }

  set(report: ProviderHealthReport): void {
    this.reports.set(String(report.providerId), report);
  }

  list(): readonly ProviderHealthReport[] {
    return Array.from(this.reports.values());
  }

  clear(): void {
    this.reports.clear();
  }
}
