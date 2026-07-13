/**
 * Gateway health aggregation.
 */

import type { ICapabilityRegistry } from "../../capability-registry/interfaces/capability-registry";
import type { IPlatformKernel } from "../../kernel/interfaces/kernel";
import type { IProviderRegistry } from "../../providers/registry/provider-registry";
import type { HealthStatus } from "../../shared/enums";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  GatewayHealthComponent,
  GatewayHealthReport,
} from "../contracts/gateway-request";

export interface GatewayHealthDependencies {
  readonly kernel: IPlatformKernel;
  readonly capabilityRegistry: ICapabilityRegistry;
  readonly providerRegistry: IProviderRegistry;
  readonly planningReady: boolean;
  readonly orchestratorReady: boolean;
  readonly runtimeReady: boolean;
  readonly nowIso: () => string;
}

export interface IGatewayHealthAggregator {
  check(): Promise<Result<GatewayHealthReport>>;
}

export class GatewayHealthAggregator implements IGatewayHealthAggregator {
  constructor(private readonly deps: GatewayHealthDependencies) {}

  async check(): Promise<Result<GatewayHealthReport>> {
    const kernelHealth = await this.deps.kernel.health();
    const components: GatewayHealthComponent[] = [
      {
        name: "kernel",
        status: kernelHealth.status,
        message: this.deps.kernel.isReady() ? "ready" : "not_ready",
      },
      {
        name: "capability-registry",
        status:
          this.deps.capabilityRegistry.list().length > 0
            ? "healthy"
            : "degraded",
        message: `capabilities=${this.deps.capabilityRegistry.list().length}`,
      },
      {
        name: "provider-registry",
        status:
          this.deps.providerRegistry.listProviders().length > 0
            ? "healthy"
            : "degraded",
        message: `providers=${this.deps.providerRegistry.listProviders().length}`,
      },
      {
        name: "planning-engine",
        status: this.deps.planningReady ? "healthy" : "unhealthy",
      },
      {
        name: "orchestrator",
        status: this.deps.orchestratorReady ? "healthy" : "unhealthy",
      },
      {
        name: "runtime",
        status: this.deps.runtimeReady ? "healthy" : "unhealthy",
      },
    ];

    return success({
      status: mergeStatus(components.map((c) => c.status)),
      components,
      checkedAt: this.deps.nowIso(),
    });
  }
}

function mergeStatus(statuses: readonly HealthStatus[]): HealthStatus {
  const rank: Record<HealthStatus, number> = {
    healthy: 0,
    unknown: 1,
    degraded: 2,
    unhealthy: 3,
  };
  return statuses.reduce<HealthStatus>(
    (acc, status) => (rank[status] > rank[acc] ? status : acc),
    "healthy"
  );
}
