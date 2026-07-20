/**
 * Capability Intelligence platform factory.
 */

import { CapabilityIntelligenceEngine } from "../engine/capability-intelligence-engine";
import { DefaultExecutionPlanBuilder } from "../engine/execution-plan-builder";
import { InMemoryCapabilityRegistry } from "../registry/in-memory-capability-registry";
import { DefaultCapabilityDiscoverer } from "../discovery/default-capability-discoverer";
import { DefaultCapabilityComposer } from "../composition/default-capability-composer";
import { DefaultDependencyResolver } from "../dependencies/default-dependency-resolver";
import { DefaultCapabilityScorer } from "../scoring/default-capability-scorer";
import { DefaultRecommendationBuilder } from "../recommendations/default-recommendation-builder";
import { DefaultCompatibilityChecker } from "../compatibility/default-compatibility-checker";
import { CAPABILITY_TAXONOMY_SEED } from "../taxonomy/capability-taxonomy";
import type { ICapabilityIntelligenceEngine } from "../interfaces/capability-intelligence";
import type { CapabilityDefinitionRecord } from "../contracts/capability";

export interface CapabilityIntelligencePlatform {
  readonly engine: ICapabilityIntelligenceEngine;
}

export interface CreateCapabilityIntelligenceOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly seed?: readonly CapabilityDefinitionRecord[];
}

export function createCapabilityIntelligencePlatform(
  options: CreateCapabilityIntelligenceOptions = {}
): CapabilityIntelligencePlatform {
  const createId = options.createId ?? ((p) => `${p}_${Date.now()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const engine = new CapabilityIntelligenceEngine({
    registry: new InMemoryCapabilityRegistry(options.seed ?? CAPABILITY_TAXONOMY_SEED),
    discoverer: new DefaultCapabilityDiscoverer(),
    composer: new DefaultCapabilityComposer(createId),
    dependencies: new DefaultDependencyResolver(),
    scorer: new DefaultCapabilityScorer(),
    recommendations: new DefaultRecommendationBuilder(),
    compatibility: new DefaultCompatibilityChecker(),
    planBuilder: new DefaultExecutionPlanBuilder(nowIso, createId),
    nowIso,
    clockMs: options.clockMs,
    createId,
  });

  return { engine };
}
