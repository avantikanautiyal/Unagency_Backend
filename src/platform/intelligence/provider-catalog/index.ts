/**
 * Official Provider Catalog — first production provider integration.
 *
 * Spreadsheet → Manifest → Universal Provider Generator → Instantiate → OS register.
 * No provider bypasses the generator. OpenAI existing leaf is preserved (not overwritten).
 */

export * from "./interfaces";
export * from "./constants";
export {
  PROVIDER_CATALOG_SEED,
  listCatalogProviderIds,
  getCatalogEntry,
  countCatalogModels,
  type CatalogProviderEntry,
  type CatalogDepartment,
  type CatalogModelRow,
} from "./catalog/provider-catalog-seed";
export { catalogEntryToManifest } from "./catalog/catalog-to-manifest";
export {
  instantiateCatalogProvider,
  buildBootstrapModels,
  type CatalogProviderPlatform,
  type DesiredCapabilityProfile,
  type BootstrapModel,
  type ModelResolution,
} from "./runtime/instantiate-catalog-provider";
export {
  CatalogIntegrationEngine,
  evaluateCatalogCertification,
  type CatalogIntegrationRequest,
  type CatalogIntegrationReport,
  type IntegratedProviderRecord,
} from "./integration/catalog-integration-engine";
export {
  registerProviderWithOs,
  type OsRegistrationTargets,
  type ProviderRegistrationRecord,
} from "./registration/os-registration";
export {
  createProviderCatalogPlatform,
  type ProviderCatalogPlatform as ProviderCatalogFactoryPlatform,
  type CreateProviderCatalogOptions,
} from "./factories/create-provider-catalog-platform";
