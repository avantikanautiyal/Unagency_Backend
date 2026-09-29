/**
 * Register Social Media schemas into the M3A ArtifactSchemaRegistry (M9A).
 */

import type { CdfArtifactType } from "../types";
import {
  onArtifactSchemaRegistryReset,
  registerArtifactSchema,
} from "../schema-registry";
import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY,
  SOCIAL_MEDIA_SCHEMA_VERSION,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "./keys";
import { validateSocialMediaArtifactData } from "./validate";

const KEYS = Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS) as SocialMediaArtifactKey[];

export function registerSocialMediaArtifactSchemas(): void {
  for (const artifactKey of KEYS) {
    const artifactType = SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY[
      artifactKey
    ] as CdfArtifactType;
    registerArtifactSchema({
      artifactType,
      artifactKey,
      schemaVersion: SOCIAL_MEDIA_SCHEMA_VERSION,
      schemaId: socialMediaSchemaId(artifactKey),
      supportedOperations: [
        "create",
        "version",
        "select",
        "approve",
        "refine",
      ],
      /** Evidence: M1 output representations png + preview; final png. Not inventing mp4/gif. */
      supportedRepresentations: ["preview", "png"],
      validate: (data) => validateSocialMediaArtifactData(artifactKey, data),
    });
  }
}

let hooked = false;

export function ensureSocialMediaSchemasRegistered(): void {
  registerSocialMediaArtifactSchemas();
  if (!hooked) {
    onArtifactSchemaRegistryReset(() => {
      registerSocialMediaArtifactSchemas();
    });
    hooked = true;
  }
}

ensureSocialMediaSchemasRegistered();
