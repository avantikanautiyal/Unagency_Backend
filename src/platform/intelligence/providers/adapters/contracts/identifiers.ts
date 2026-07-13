/**
 * Adapter identifiers + manifest version value object.
 *
 * Purpose: Branded ids and a parseable manifest version.
 * Responsibilities: Type-safe adapter ids; semver-ish manifest version.
 * Usage: Referenced across the adapter framework.
 * Future Extension: Pre-release/build metadata on versions.
 */

declare const __adapterBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__adapterBrand]: B };

export type ProviderAdapterId = Brand<string, "ProviderAdapterId">;

export function asProviderAdapterId(value: string): ProviderAdapterId {
  return value as ProviderAdapterId;
}

/**
 * Immutable manifest version (major.minor.patch).
 */
export interface ProviderManifestVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly raw: string;
}

export function parseManifestVersion(raw: string): ProviderManifestVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: raw.trim(),
  };
}

export function manifestVersion(
  major: number,
  minor: number,
  patch: number
): ProviderManifestVersion {
  return { major, minor, patch, raw: `${major}.${minor}.${patch}` };
}
