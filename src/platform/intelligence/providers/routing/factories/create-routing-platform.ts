/**
 * Routing platform factory.
 */

import { DefaultComplianceEngine } from "../compliance/default-compliance-engine";
import { DefaultRoutingDiagnostics } from "../diagnostics/default-diagnostics";
import { ProviderRoutingEngine } from "../engine/routing-engine";
import { DefaultExperimentEngine, DefaultShadowEngine } from "../experiments/default-experiment-engine";
import { DefaultFailoverEngine } from "../failover/default-failover-engine";
import { DefaultRoutingHealthProvider } from "../health/default-health-provider";
import { InMemoryRoutingHistory } from "../history/in-memory-history";
import { loadBalancerFor } from "../load-balancing/load-balancers";
import { DefaultPreferenceResolver } from "../preferences/default-preference-resolver";
import { DefaultRoutingRanker } from "../ranking/default-ranker";
import { DefaultRoutingScorer } from "../scoring/default-scorer";
import type { LoadBalancingKind } from "../contracts/enums";
import type {
  IProviderRoutingEngine,
  IRoutingDiagnostics,
  IRoutingEventPublisher,
  IRoutingHealthProvider,
  IRoutingHistory,
} from "../interfaces/routing";

export interface RoutingPlatform {
  readonly engine: IProviderRoutingEngine;
  readonly diagnostics: IRoutingDiagnostics;
  readonly history: IRoutingHistory;
  readonly health: IRoutingHealthProvider;
}

export interface CreateRoutingPlatformOptions {
  readonly loadBalancing?: LoadBalancingKind;
  readonly eventPublisher?: IRoutingEventPublisher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createRoutingPlatform(
  options: CreateRoutingPlatformOptions = {}
): RoutingPlatform {
  const history = new InMemoryRoutingHistory();
  const health = new DefaultRoutingHealthProvider();
  const scorer = new DefaultRoutingScorer(history);
  const diagnostics = new DefaultRoutingDiagnostics();

  const engine = new ProviderRoutingEngine({
    scorer,
    ranker: new DefaultRoutingRanker(),
    compliance: new DefaultComplianceEngine(),
    preferences: new DefaultPreferenceResolver(),
    failover: new DefaultFailoverEngine(),
    experiments: new DefaultExperimentEngine(),
    shadow: new DefaultShadowEngine(),
    loadBalancer: loadBalancerFor(options.loadBalancing ?? "weighted"),
    diagnostics,
    eventPublisher: options.eventPublisher,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });

  return { engine, diagnostics, history, health };
}
