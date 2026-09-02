/**
 * Provider factory.
 *
 * Purpose: Create provider adapters through interfaces only.
 * Responsibilities: Build IProviderAdapter from ProviderDefinition.
 * Usage: After registry registration; no SDK imports.
 * Future Extension: Vendor-specific adapter registration map.
 */

import { failure, success } from "../../core/result";
import type { Result } from "../../core/result";
import type { ProviderAuthenticationContract } from "../authentication/provider-authentication";
import { PlaceholderProviderAdapter } from "../adapters/placeholder-provider-adapter";
import type { IProviderAdapter } from "../adapters/provider-adapter";
import { ProviderValidationError } from "../errors";
import type { ProviderDefinition } from "../metadata/provider-definition";
import type { IProviderRegistry } from "../registry/provider-registry";

export interface IProviderFactory {
  createAdapter(
    definition: ProviderDefinition,
    authentication?: ProviderAuthenticationContract
  ): Result<IProviderAdapter>;

  createAdapterForProvider(
    registry: IProviderRegistry,
    providerId: ProviderDefinition["id"],
    authentication?: ProviderAuthenticationContract
  ): Result<IProviderAdapter>;
}

/**
 * Default factory — returns placeholder adapters only (no vendor SDKs).
 */
export class ProviderFactory implements IProviderFactory {
  createAdapter(
    definition: ProviderDefinition,
    authentication?: ProviderAuthenticationContract
  ): Result<IProviderAdapter> {
    if (!definition.id) {
      return failure(
        new ProviderValidationError("Cannot create adapter without provider id")
      );
    }

    const adapter = new PlaceholderProviderAdapter({
      definition,
      authentication,
    });
    return success(adapter);
  }

  createAdapterForProvider(
    registry: IProviderRegistry,
    providerId: ProviderDefinition["id"],
    authentication?: ProviderAuthenticationContract
  ): Result<IProviderAdapter> {
    const resolved = registry.resolveProvider(providerId);
    if (!resolved.ok) {
      return resolved;
    }
    return this.createAdapter(resolved.value, authentication);
  }
}
