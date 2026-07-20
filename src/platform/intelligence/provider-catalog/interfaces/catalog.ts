/**
 * Provider Catalog platform interfaces.
 */

import type { Result } from "../../shared/result";
import type {
  CatalogIntegrationRequest,
  CatalogIntegrationReport,
} from "../integration/catalog-integration-engine";

export interface ICatalogIntegrationEngine {
  integrate(request: CatalogIntegrationRequest): Promise<Result<CatalogIntegrationReport>>;
}
