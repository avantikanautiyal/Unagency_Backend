/**
 * Packaging schema metadata (M8A) — registered into M3A ArtifactSchemaRegistry.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  type PackagingArtifactKey,
} from "./keys";

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
  ],
  "packaging.views": [PACKAGING_ARTIFACT_KEYS.completePack],
  "packaging.sku-adaptations": [PACKAGING_ARTIFACT_KEYS.views],
};
