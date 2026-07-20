/**
 * Multi-Provider Production Rollout.
 *
 * Integrates every Official Provider Catalog provider via Universal Provider Generator.
 * Publishes complete benchmark evidence for Evaluation / Learning / Model Intelligence.
 * Additive — does not redesign Intelligence OS or Infrastructure.
 */

export * from "./contracts";
export * from "./interfaces";
export { MultiProviderRolloutEngine } from "./engine/multi-provider-rollout-engine";
export { InMemoryBenchmarkEvidenceStore } from "./evidence/evidence-store";
export {
  buildEvidenceForIntegratedProvider,
  buildComparisons,
  simulateProviderMetrics,
} from "./evidence/build-evidence";
export {
  evidenceToObservabilityEvents,
  publishEvidenceToObservability,
} from "./evidence/publish-observability";
export {
  buildDiscoveries,
  buildModelInventory,
  buildCapabilityMappings,
  buildCapabilityCoverage,
  buildCertifications,
} from "./validation/coverage";
export {
  buildRuntimeRegistration,
  buildCompatibilityChecklist,
} from "./compatibility/compatibility";
export { MultiProviderRolloutRequestBuilder } from "./builders/multi-provider-rollout-request-builder";
export {
  createMultiProviderRolloutPlatform,
  type MultiProviderRolloutPlatform,
  type CreateMultiProviderRolloutOptions,
} from "./factories/create-multi-provider-rollout-platform";
