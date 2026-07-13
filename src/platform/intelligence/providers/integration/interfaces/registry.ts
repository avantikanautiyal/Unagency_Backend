/**
 * Integration registry port.
 *
 * Purpose: Own provider integration registration records.
 * Responsibilities: register, resolve, list, remove, describe.
 * Usage: Central store for integrated providers.
 * Future Extension: Indexed queries by capability/modality.
 */

import type { Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderRegistrationRecord } from "../contracts/health-registration";
import type { IntegrationId } from "../contracts/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";

export interface IProviderIntegrationRegistry {
  register(
    manifest: ProviderManifest,
    integrationId: IntegrationId
  ): Result<ProviderRegistrationRecord>;
  resolve(providerId: ProviderId): Result<ProviderRegistrationRecord>;
  resolveByIntegrationId(
    integrationId: IntegrationId
  ): Result<ProviderRegistrationRecord>;
  list(): readonly ProviderRegistrationRecord[];
  remove(providerId: ProviderId): Result<void>;
  update(
    providerId: ProviderId,
    manifest: ProviderManifest
  ): Result<ProviderRegistrationRecord>;
  has(providerId: ProviderId): boolean;
}
