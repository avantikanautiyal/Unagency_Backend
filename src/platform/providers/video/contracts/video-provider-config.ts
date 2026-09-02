/**
 * Catalog-backed video provider configuration.
 */

import type { UnagencyAsyncVideoContract } from "./unagency-async-video-contract";

export interface VideoWireModelMapping {
  /** Inventory canonical model id suffix, e.g. runway-gen-4 for runway/runway-gen-4 */
  readonly inventoryModelId: string;
  /** Wire model id sent to provider contract */
  readonly wireModelId: string;
  readonly displayName: string;
  readonly supportsTextToVideo: boolean;
  readonly supportsImageToVideo: boolean;
}

export interface VideoProviderConfig {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly catalogProviderId: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly contractVerifiedEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly wireModels: readonly VideoWireModelMapping[];
  readonly supportsCancellation: boolean;
  readonly contract: UnagencyAsyncVideoContract;
  /**
   * When false, provider is catalogued but not LIVE-executable — vendor API not verified in repo.
   */
  readonly vendorApiVerified: boolean;
}
