/**
 * Provider Mesh & Live Provider Intelligence Platform.
 *
 * Operational control layer for provider health, scoring, routing hints,
 * failover / canary / shadow recommendations. Never executes providers.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { ProviderMeshRequestBuilder } from "./builders/mesh-request-builder";
export {
  createProviderMeshPlatform,
  type ProviderMeshPlatform,
  type CreateProviderMeshOptions,
} from "./factories/create-provider-mesh-platform";
export { ProviderMeshEngine } from "./engine/provider-mesh-engine";
