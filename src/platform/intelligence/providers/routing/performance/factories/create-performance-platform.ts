/**
 * Factory for M9.5H performance feedback + adaptive scoring helpers.
 */

import {
  loadAdaptiveRoutingConfig,
  loadProviderFailoverConfig,
  type AdaptiveRoutingConfig,
  type ProviderFailoverConfig,
} from "../config/adaptive-routing-config";
import { InMemoryModelPerformanceStore } from "../stores/in-memory-model-performance-store";
import { MongoModelPerformanceStore } from "../stores/mongo-model-performance-store";
import { ModelPerformanceIntelligence } from "../intelligence/model-performance-intelligence";
import { AdaptiveRoutingScorer } from "../scoring/adaptive-routing-scorer";
import { PerformanceEvidenceWriter } from "../feedback/performance-evidence-writer";
import { DefaultRoutingScorer } from "../../scoring/default-scorer";
import type { IModelPerformanceStore } from "../interfaces/model-performance-store";
import type { IModelPerformanceIntelligence } from "../interfaces/performance-intelligence";
import type { IRoutingHistory, IRoutingScorer } from "../../interfaces/routing";

import type { CostCalculator } from "../../../../cost/calculator/cost-calculator";
import type { IProviderPricingCatalogue } from "../../../../cost/contracts/pricing-catalogue";
import {
  InMemoryProviderPricingCatalogue,
} from "../../../../cost/contracts/pricing-catalogue";
import { CostCalculator as CostCalculatorImpl } from "../../../../cost/calculator/cost-calculator";

export interface PerformancePlatform {
  readonly store: IModelPerformanceStore;
  readonly intelligence: IModelPerformanceIntelligence;
  readonly scorer: AdaptiveRoutingScorer;
  readonly evidenceWriter: PerformanceEvidenceWriter;
  readonly adaptiveConfig: AdaptiveRoutingConfig;
  readonly failoverConfig: ProviderFailoverConfig;
  readonly pricingCatalogue: IProviderPricingCatalogue;
  readonly costCalculator: CostCalculator;
}

export interface CreatePerformancePlatformOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly store?: IModelPerformanceStore;
  /** Use Mongo when durable; default in-memory. */
  readonly durableMongo?: boolean;
  readonly history?: IRoutingHistory;
  readonly baseScorer?: IRoutingScorer;
  readonly nowMs?: () => number;
  readonly random?: () => number;
  readonly pricingCatalogue?: IProviderPricingCatalogue;
  readonly costCalculator?: CostCalculator;
}

export function createPerformancePlatform(
  options: CreatePerformancePlatformOptions = {}
): PerformancePlatform {
  const env = options.env ?? process.env;
  const adaptiveConfig = loadAdaptiveRoutingConfig(env);
  const failoverConfig = loadProviderFailoverConfig(env);

  const store =
    options.store ??
    (options.durableMongo
      ? new MongoModelPerformanceStore()
      : new InMemoryModelPerformanceStore());

  const intelligence = new ModelPerformanceIntelligence(
    store,
    adaptiveConfig,
    options.nowMs
  );

  const baseScorer = options.baseScorer ?? new DefaultRoutingScorer(options.history);
  const scorer = new AdaptiveRoutingScorer(
    baseScorer,
    intelligence,
    adaptiveConfig,
    options.random
  );

  const pricingCatalogue =
    options.pricingCatalogue ?? new InMemoryProviderPricingCatalogue();
  const costCalculator =
    options.costCalculator ?? new CostCalculatorImpl(pricingCatalogue);

  const evidenceWriter = new PerformanceEvidenceWriter(
    store,
    options.history,
    costCalculator
  );

  return {
    store,
    intelligence,
    scorer,
    evidenceWriter,
    adaptiveConfig,
    failoverConfig,
    pricingCatalogue,
    costCalculator,
  };
}
