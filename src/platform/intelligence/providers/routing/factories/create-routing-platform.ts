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
  IRoutingScorer,
} from "../interfaces/routing";
import { createPerformancePlatform } from "../performance/factories/create-performance-platform";
import type { IModelPerformanceStore } from "../performance/interfaces/model-performance-store";
import type { PerformancePlatform } from "../performance/factories/create-performance-platform";

export interface RoutingPlatform {
  readonly engine: IProviderRoutingEngine;
  readonly diagnostics: IRoutingDiagnostics;
  readonly history: IRoutingHistory;
  readonly health: IRoutingHealthProvider;
  /** M9.5H — present when performance feedback platform is attached. */
  readonly performance?: PerformancePlatform;
}

export interface CreateRoutingPlatformOptions {
  readonly loadBalancing?: LoadBalancingKind;
  readonly eventPublisher?: IRoutingEventPublisher;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** Optional durable/in-memory performance store (adaptive feedback). */
  readonly performanceStore?: IModelPerformanceStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly durableMongo?: boolean;
  /** Override scorer (tests). When omitted, uses adaptive scorer wrapping static. */
  readonly scorer?: IRoutingScorer;
}

export function createRoutingPlatform(
  options: CreateRoutingPlatformOptions = {}
): RoutingPlatform {
  const history = new InMemoryRoutingHistory();
  const health = new DefaultRoutingHealthProvider();
  const diagnostics = new DefaultRoutingDiagnostics();

  const performance = createPerformancePlatform({
    env: options.env,
    store: options.performanceStore,
    durableMongo: options.durableMongo,
    history,
    nowMs: options.clockMs,
  });

  const scorer = options.scorer ?? performance.scorer;

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

  return { engine, diagnostics, history, health, performance };
}
