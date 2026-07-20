/**
 * Lightweight discovery helpers for generator (manifest → discovery plan).
 */

import type { ProviderManifestSpec } from "../contracts/manifest";

export interface DiscoveryPlan {
  readonly endpoint: string;
  readonly baseUrl: string;
  readonly method: "GET";
  readonly cacheTtlHintSec: number;
  readonly neverHardcodeModels: true;
}

export function planDiscovery(manifest: ProviderManifestSpec): DiscoveryPlan {
  return {
    endpoint: manifest.discoveryEndpoint,
    baseUrl: manifest.baseUrl,
    method: "GET",
    cacheTtlHintSec: 300,
    neverHardcodeModels: true,
  };
}
