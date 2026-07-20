/**
 * Intelligence OS Integration Layer.
 *
 * Wires frozen modules into one deterministic pipeline via bridges only.
 * Does not redesign, merge, or replace module ownership.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export {
  createIntelligenceOsIntegrationPlatform,
  type IntelligenceOsIntegrationPlatform,
  type CreateIntelligenceOsIntegrationOptions,
} from "./factories/create-intelligence-os-integration-platform";
export { IntelligenceOsIntegrationEngine } from "./engine/intelligence-os-integration-engine";
export { IntegrationPipeline } from "./pipeline/integration-pipeline";
export {
  summarizeTrace,
  isCompleteFullPipeline,
  collectBridgeFailures,
} from "./diagnostics";
