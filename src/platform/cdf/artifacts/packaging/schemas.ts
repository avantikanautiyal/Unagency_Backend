/**
 * Packaging schema metadata (M8A) — registered into M3A ArtifactSchemaRegistry.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "./keys";

export const PACKAGING_SCHEMA_IDS = {
  dieline: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline),
  routes: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes),
  threeDDirection: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection),
  frontPack: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack),
  completePack: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.completePack),
  views: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views),
  skuAdaptations: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.skuAdaptations),
} as const;

/** Structural required-field checklist (documentation + tests). */
export const PACKAGING_SCHEMA_REQUIRED: Record<
  PackagingArtifactKey,
  readonly string[]
> = {
  "packaging.dieline": ["schemaId", "pathKind"],
  "packaging.routes": ["schemaId", "routes"],
  "packaging.3d-direction": [
    "schemaId",
    "candidates",
    "dielineRef",
    "routesRef",
  ],
  "packaging.front-pack": [
    "schemaId",
    "frontId",
    "routesRef",
    "threeDDirectionRef",
  ],
  "packaging.complete-pack": [
    "schemaId",
    "surfaces",
    "dielineRef",
    "routesRef",
    "threeDDirectionRef",
    "frontPackRef",
  ],
  "packaging.views": ["schemaId", "views", "completePackRef"],
  "packaging.sku-adaptations": ["schemaId", "skus", "viewsRef"],
};

/**
 * Exact-version dependency edges (child requires these upstream keys).
 * Derived from M1 packaging phase inherits / deps.
 */
export const PACKAGING_DEPENDENCY_GRAPH: Record<
  PackagingArtifactKey,
  readonly PackagingArtifactKey[]
> = {
  "packaging.dieline": [],
  "packaging.routes": [PACKAGING_ARTIFACT_KEYS.dieline],
  "packaging.3d-direction": [
    PACKAGING_ARTIFACT_KEYS.dieline,
    PACKAGING_ARTIFACT_KEYS.routes,
  ],
  "packaging.front-pack": [
    PACKAGING_ARTIFACT_KEYS.routes,
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
  ],
  "packaging.complete-pack": [
    PACKAGING_ARTIFACT_KEYS.dieline,
    PACKAGING_ARTIFACT_KEYS.routes,
    PACKAGING_ARTIFACT_KEYS.threeDDirection,
    PACKAGING_ARTIFACT_KEYS.frontPack,
  ],
  "packaging.views": [PACKAGING_ARTIFACT_KEYS.completePack],
  "packaging.sku-adaptations": [PACKAGING_ARTIFACT_KEYS.views],
};
