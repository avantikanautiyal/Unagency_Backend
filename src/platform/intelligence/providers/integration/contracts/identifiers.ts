/**
 * Integration identifiers.
 *
 * Purpose: Branded ids for installations and integration operations.
 * Responsibilities: Type-safe identifiers (never plain strings).
 * Usage: Referenced across the integration framework.
 * Future Extension: Distributed installation ids.
 */

declare const __integrationBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__integrationBrand]: B };

export type IntegrationId = Brand<string, "IntegrationId">;
export type InstallationId = Brand<string, "InstallationId">;

export function asIntegrationId(value: string): IntegrationId {
  return value as IntegrationId;
}
export function asInstallationId(value: string): InstallationId {
  return value as InstallationId;
}
