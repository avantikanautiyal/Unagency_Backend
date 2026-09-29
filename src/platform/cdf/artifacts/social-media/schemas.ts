/**
 * Social Media schema metadata (M9A) — registered into M3A ArtifactSchemaRegistry.
 */

import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "./keys";

export const SOCIAL_MEDIA_SCHEMA_IDS = {
  platform: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.platform),
  sizeReference: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference),
  routes: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.routes),
  output: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output),
} as const;

/** Structural required-field checklist (documentation + tests). */
export const SOCIAL_MEDIA_SCHEMA_REQUIRED: Record<
  SocialMediaArtifactKey,
  readonly string[]
> = {
  "social-media.platform": ["schemaId", "platformId", "platform"],
  "social-media.size-reference": ["schemaId", "optionId", "pathKind"],
  "social-media.routes": ["schemaId", "routes"],
  "social-media.output": ["schemaId", "creativeId", "routesRef"],
};

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

/** Optional/informational upstream keys (exact refs when present). */
export const SOCIAL_MEDIA_OPTIONAL_DEPENDENCIES: Record<
  SocialMediaArtifactKey,
  readonly SocialMediaArtifactKey[]
> = {
  "social-media.platform": [],
  "social-media.size-reference": [],
  "social-media.routes": [
    SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  ],
  "social-media.output": [
    SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
  ],
};
