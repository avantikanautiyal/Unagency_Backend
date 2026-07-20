/**
 * Naming helpers for generated providers.
 */

import type { ProviderManifestSpec } from "../contracts/manifest";

export function toPascalCase(id: string): string {
  return id
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

export function toConstantCase(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export function defaultPackageRoot(manifest: ProviderManifestSpec): string {
  return (
    manifest.packagePathHint ??
    `src/platform/intelligence/providers/${manifest.providerId}`
  );
}

export function buildTemplateContext(manifest: ProviderManifestSpec) {
  return {
    manifest,
    classPrefix: toPascalCase(manifest.providerId),
    packageRoot: defaultPackageRoot(manifest),
    constantPrefix: toConstantCase(manifest.providerId),
  };
}
