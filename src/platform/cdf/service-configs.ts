/**
 * CDF service configs — legacy runtime projection from the CDF 2.0 canonical registry.
 *
 * Source of truth: Unagency-frontend/packages/api/src/domain/cdf
 * Legacy inline config snapshot removed — canonical registry is sole SoT.
 */

import type { CdfServiceConfig } from "./types";
import {
  buildLegacyCdfConfigsFromCanonical,
  listLegacyCdfServiceIdsFromCanonical,
  resolveLegacyCdfConfigFromCanonical,
} from "./canonical";

const LEGACY_CONFIGS = buildLegacyCdfConfigsFromCanonical();

function must(serviceId: string): CdfServiceConfig {
  const cfg = LEGACY_CONFIGS[serviceId];
  if (!cfg) {
    throw new Error(`CDF canonical registry missing service ${serviceId}`);
  }
  return cfg;
}

export const socialMediaConfig: CdfServiceConfig = must("social-media");
export const presentationConfig: CdfServiceConfig = must("presentation");
export const emailersConfig: CdfServiceConfig = must("emailers");
export const webTechConfig: CdfServiceConfig = must("web-tech");
export const brandStrategyConfig: CdfServiceConfig = must("brand-strategy");
export const adCampaignsConfig: CdfServiceConfig = must("ad-campaigns");
export const logoConfig: CdfServiceConfig = must("logo");
export const packagingConfig: CdfServiceConfig = must("packaging");
export const printOohConfig: CdfServiceConfig = must("print-ooh");
export const videosConfig: CdfServiceConfig = must("videos");
export const storeDisplayConfig: CdfServiceConfig = must("store-display");
export const merchandiseConfig: CdfServiceConfig = must("merchandise");
export const illustrationConfig: CdfServiceConfig = must("illustration");
export const productionConfig: CdfServiceConfig = must("production");
export const eventBrandingConfig: CdfServiceConfig = must("event-branding");

export const CDF_SERVICE_CONFIGS: CdfServiceConfig[] = [
  socialMediaConfig,
  presentationConfig,
  emailersConfig,
  webTechConfig,
  brandStrategyConfig,
  adCampaignsConfig,
  logoConfig,
  packagingConfig,
  printOohConfig,
  videosConfig,
  storeDisplayConfig,
  merchandiseConfig,
  illustrationConfig,
  productionConfig,
  eventBrandingConfig,
];

export const CDF_CONFIG_BY_ID: Record<string, CdfServiceConfig> = LEGACY_CONFIGS;

export function resolveCdfServiceConfig(
  serviceKey: string
): CdfServiceConfig | undefined {
  return resolveLegacyCdfConfigFromCanonical(serviceKey);
}

export function listCdfServiceIds(): string[] {
  return listLegacyCdfServiceIdsFromCanonical();
}
