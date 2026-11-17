/**
 * Social Media schema metadata (M9A) — registered into M3A ArtifactSchemaRegistry.
 */

import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  type SocialMediaArtifactKey,
} from "./keys";

/**
 * Exact-version dependency edges (child requires these upstream keys).
 * Derived from M1 social-media phase inherits / deps.
 *
 * platform → size-reference → routes → output
 * (final has no creative schema)
 *
 * output M1 deps list routes only; platform/size pins are optional/informational.
 */
export const SOCIAL_MEDIA_DEPENDENCY_GRAPH: Record<
  SocialMediaArtifactKey,
  readonly SocialMediaArtifactKey[]
> = {
  "social-media.platform": [],
  "social-media.size-reference": [SOCIAL_MEDIA_ARTIFACT_KEYS.platform],
  "social-media.routes": [SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference],
  "social-media.output": [SOCIAL_MEDIA_ARTIFACT_KEYS.routes],
};

