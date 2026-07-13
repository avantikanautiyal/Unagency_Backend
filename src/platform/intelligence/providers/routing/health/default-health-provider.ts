/**
 * Default routing health provider.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { RoutingHealthSnapshot } from "../contracts/plan";
import type { IRoutingHealthProvider } from "../interfaces/routing";

export class DefaultRoutingHealthProvider implements IRoutingHealthProvider {
  private readonly states = new Map<string, RoutingHealthSnapshot>();

  seed(providerId: ProviderId, snapshot: RoutingHealthSnapshot): void {
    this.states.set(String(providerId), snapshot);
  }

  snapshot(providerId: ProviderId): RoutingHealthSnapshot {
    return (
      this.states.get(String(providerId)) ?? {
        providerId,
        state: "unknown",
        checkedAt: new Date().toISOString(),
      }
    );
  }

  isHealthy(providerId: ProviderId): boolean {
    const s = this.snapshot(providerId);
    return s.state === "healthy" || s.state === "unknown";
  }
}
