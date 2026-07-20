/**
 * Capability Intelligence Platform.
 *
 * Canonical capability-first intelligence layer.
 * Business modules request capabilities — never providers or model brands.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { CapabilityIntelligenceRequestBuilder } from "./builders/capability-intelligence-request-builder";
export {
  createCapabilityIntelligencePlatform,
  type CapabilityIntelligencePlatform,
  type CreateCapabilityIntelligenceOptions,
} from "./factories/create-capability-intelligence-platform";
export { CapabilityIntelligenceEngine } from "./engine/capability-intelligence-engine";
export { CAPABILITY_TAXONOMY_SEED } from "./taxonomy/capability-taxonomy";
