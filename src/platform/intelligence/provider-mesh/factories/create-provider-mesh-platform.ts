/**
 * Provider Mesh platform factory.
 */

import { ProviderMeshEngine } from "../engine/provider-mesh-engine";
import { InMemoryMeshRegistry } from "../registry/in-memory-mesh-registry";
import { DefaultTelemetryAggregator } from "../telemetry/default-telemetry-aggregator";
import { DefaultHealthEvaluator } from "../health/default-health-evaluator";
import { DefaultProviderScorer } from "../provider-score/default-provider-scorer";
import { DefaultRoutingHintBuilder } from "../routing-hints/default-routing-hint-builder";
import { DefaultFailoverPlanner } from "../failover/default-failover-planner";
import { DefaultCanaryPlanner } from "../canary/default-canary-planner";
import { DefaultShadowPlanner } from "../shadow/default-shadow-planner";
import { DefaultTopologyBuilder } from "../topology/default-topology-builder";
import { DefaultCapacityReporter } from "../capacity/default-capacity-reporter";
import type { IProviderMeshEngine } from "../interfaces/mesh";

export interface ProviderMeshPlatform {
  readonly engine: IProviderMeshEngine;
}

export interface CreateProviderMeshOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createProviderMeshPlatform(
  options: CreateProviderMeshOptions = {}
): ProviderMeshPlatform {
  const engine = new ProviderMeshEngine({
    registry: new InMemoryMeshRegistry(),
    telemetry: new DefaultTelemetryAggregator(),
    health: new DefaultHealthEvaluator(),
    scorer: new DefaultProviderScorer(),
    routingHints: new DefaultRoutingHintBuilder(),
    failover: new DefaultFailoverPlanner(),
    canary: new DefaultCanaryPlanner(),
    shadow: new DefaultShadowPlanner(),
    topology: new DefaultTopologyBuilder(),
    capacity: new DefaultCapacityReporter(),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });
  return { engine };
}
