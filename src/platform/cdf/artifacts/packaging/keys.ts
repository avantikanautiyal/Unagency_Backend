/**
 * Packaging artifact keys (M8A) — aligned with M1 CDF registry phase artifactKeys.
 *
 * M1 emits `${serviceId}.${phaseId}` for packaging helpers:
 *   packaging.dieline | packaging.routes | packaging.3d-direction |
 *   packaging.front-pack | packaging.complete-pack | packaging.views |
 *   packaging.sku-adaptations | packaging.final
 *
 * Vocabulary decisions (forensic):
 * - Use packaging.routes (not packaging.design-route) to match M1 without registry churn.
 *   Alias packaging.design-route → packaging.routes for adapter/target resolution only.
 * - No packaging.source — brief lives in ActiveBrief / Requirement Engine.
 * - No packaging.design-system — Packaging has no select→design-system phase.
 *   Design direction is structured on packaging.routes; shared DS reuse is future/UNRESOLVED.
 * - packaging.final is a download/action boundary, not a creative schema registered here.
 */

export const PACKAGING_ARTIFACT_KEYS = {
  dieline: "packaging.dieline",
  routes: "packaging.routes",
  threeDDirection: "packaging.3d-direction",
  frontPack: "packaging.front-pack",
  completePack: "packaging.complete-pack",
  views: "packaging.views",
  skuAdaptations: "packaging.sku-adaptations",
} as const;

export type PackagingArtifactKey =
  (typeof PACKAGING_ARTIFACT_KEYS)[keyof typeof PACKAGING_ARTIFACT_KEYS];

/** M1 CdfArtifactType mapping for each packaging key. */
export const PACKAGING_ARTIFACT_TYPE_BY_KEY = {
  "packaging.dieline": "config_choice",
  "packaging.routes": "text_choice",
  "packaging.3d-direction": "pack",
  "packaging.front-pack": "pack",
  "packaging.complete-pack": "pack",
  "packaging.views": "pack",
  "packaging.sku-adaptations": "pack",
} as const satisfies Record<PackagingArtifactKey, string>;

export const PACKAGING_SCHEMA_VERSION = "1";

/** Suggested alias → canonical key (never scatter alias strings in controllers). */
export const PACKAGING_KEY_ALIASES: Record<string, PackagingArtifactKey> = {
  "packaging.dieline": PACKAGING_ARTIFACT_KEYS.dieline,
  "packaging.routes": PACKAGING_ARTIFACT_KEYS.routes,
  "packaging.design-route": PACKAGING_ARTIFACT_KEYS.routes,
  "packaging.design-routes": PACKAGING_ARTIFACT_KEYS.routes,
  "packaging.3d-direction": PACKAGING_ARTIFACT_KEYS.threeDDirection,
  "packaging.3d": PACKAGING_ARTIFACT_KEYS.threeDDirection,
  "packaging.front-pack": PACKAGING_ARTIFACT_KEYS.frontPack,
  "packaging.front": PACKAGING_ARTIFACT_KEYS.frontPack,
  "packaging.complete-pack": PACKAGING_ARTIFACT_KEYS.completePack,
  "packaging.views": PACKAGING_ARTIFACT_KEYS.views,
  "packaging.view": PACKAGING_ARTIFACT_KEYS.views,
  "packaging.sku-adaptations": PACKAGING_ARTIFACT_KEYS.skuAdaptations,
  "packaging.sku": PACKAGING_ARTIFACT_KEYS.skuAdaptations,
};

/** Phase id → canonical packaging artifact key (final has no creative schema). */
export const PACKAGING_PHASE_ARTIFACT_KEY: Record<
  string,
  PackagingArtifactKey | null
> = {
  dieline: PACKAGING_ARTIFACT_KEYS.dieline,
  routes: PACKAGING_ARTIFACT_KEYS.routes,
  "3d-direction": PACKAGING_ARTIFACT_KEYS.threeDDirection,
  "front-pack": PACKAGING_ARTIFACT_KEYS.frontPack,
  "complete-pack": PACKAGING_ARTIFACT_KEYS.completePack,
  views: PACKAGING_ARTIFACT_KEYS.views,
  "sku-adaptations": PACKAGING_ARTIFACT_KEYS.skuAdaptations,
  final: null,
};

export function packagingSchemaId(
  key: PackagingArtifactKey,
  version: string = PACKAGING_SCHEMA_VERSION,
): string {
  const short = key.replace(/^packaging\./, "").replace(/-/g, "_");
  return `unagency.packaging.${short}.v${version}`;
}

export function isPackagingArtifactKey(key: string): key is PackagingArtifactKey {
  return (Object.values(PACKAGING_ARTIFACT_KEYS) as string[]).includes(key);
}

export function resolvePackagingArtifactKey(
  keyOrAlias: string,
): PackagingArtifactKey | undefined {
  return PACKAGING_KEY_ALIASES[keyOrAlias];
}
