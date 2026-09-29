/**
 * Deterministic Social Media artifact fixtures (M9A) — no AI providers.
 */

import {
  SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
} from "./coordinates";
import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  socialMediaSchemaId,
} from "./keys";
import type {
  SocialMediaOutputData,
  SocialMediaPlatformData,
  SocialMediaRoutesData,
  SocialMediaSizeReferenceData,
} from "./types";

export const SOCIAL_MEDIA_FIXTURE_IDS = {
  platformArtifactId: "cdfart_fixture_social_platform_01",
  sizeArtifactId: "cdfart_fixture_social_size_01",
  routesArtifactId: "cdfart_fixture_social_routes_01",
  outputArtifactId: "cdfart_fixture_social_output_01",
  vaultImage: "507f1f77bcf86cd799439021",
  vaultReference: "507f1f77bcf86cd799439022",
} as const;

export function fixtureSocialMediaPlatform(): SocialMediaPlatformData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.platform),
    platformId: "platform_instagram",
    platform: "instagram",
    label: "Instagram",
    notes: "Feed, Stories, Reels and related Instagram formats.",
    sourceRefs: {
      sourceInputIds: ["src_social_fixture_1"],
      activeBriefId: "brief_social_fixture_1",
      activeBriefVersion: 1,
      contextId: "ctx_social_fixture_1",
      contextHash: "hash_social_fixture_1",
    },
  };
}

export function fixtureSocialMediaSizeReference(
  platformArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.platformArtifactId,
  platformVersion = 1,
): SocialMediaSizeReferenceData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference),
    optionId: "size_option_platform_default",
    pathKind: "use_platform_size",
    canvas: {
      widthPx: 1080,
      heightPx: 1350,
      coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
      source: "platform_default",
      label: "1080x1350",
      elementLayoutUnresolved: true,
    },
    platformRef: {
      artifactId: platformArtifactId,
      version: platformVersion,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    },
    formatHint: "feed-post",
    sourceRefs: {
      activeBriefId: "brief_social_fixture_1",
      activeBriefVersion: 1,
    },
  };
}

export function fixtureSocialMediaSizeEnter(
  platformArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.platformArtifactId,
): SocialMediaSizeReferenceData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference),
    optionId: "size_option_enter",
    pathKind: "enter_size",
    canvas: {
      widthPx: 1080,
      heightPx: 1080,
      coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
      source: "user_entered",
      label: "1080x1080",
      elementLayoutUnresolved: true,
    },
    platformRef: {
      artifactId: platformArtifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    },
  };
}

export function fixtureSocialMediaSizeUploadReference(
  platformArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.platformArtifactId,
): SocialMediaSizeReferenceData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference),
    optionId: "size_option_upload_ref",
    pathKind: "upload_reference",
    referenceAssetRefs: [
      {
        vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultReference,
        role: "reference_creative",
        label: "Inspiration post",
      },
    ],
    platformRef: {
      artifactId: platformArtifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    },
  };
}

export function fixtureSocialMediaRoutes(
  sizeArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.sizeArtifactId,
  sizeVersion = 1,
  platformArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.platformArtifactId,
): SocialMediaRoutesData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.routes),
    routes: [
      {
        routeId: "route_01",
        name: "Everyday Energy",
        creativeIdea: "Bright mango splash with casual product hold",
        visualTreatment: "High-key daylight, soft grain",
        headlineAngle: "Energy that fits Tuesday",
        rationale: "Matches brief everyday energy tone",
        visualCharacteristics: ["bright", "casual", "product-forward"],
      },
      {
        routeId: "route_02",
        name: "Cold Press Quiet",
        creativeIdea: "Minimal bottle on linen",
        visualTreatment: "Muted greens, generous negative space",
        headlineAngle: "Quiet strength",
        rationale: "Premium restraint for LinkedIn-adjacent reuse",
      },
      {
        routeId: "route_03",
        name: "Street Pulse",
        creativeIdea: "Motion blur city + pack lockup",
        visualTreatment: "High contrast, diagonal crop",
        headlineAngle: "Move with it",
        rationale: "Youthful feed energy",
      },
    ],
    selectedRouteId: "route_01",
    sizeReferenceRef: {
      artifactId: sizeArtifactId,
      version: sizeVersion,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    },
    platformRef: {
      artifactId: platformArtifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    },
    sourceRefs: {
      contextHash: "hash_social_fixture_1",
      upstreamArtifactRefs: [
        {
          artifactId: sizeArtifactId,
          version: sizeVersion,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        },
      ],
    },
  };
}

export function fixtureSocialMediaOutput(
  routesArtifactId: string = SOCIAL_MEDIA_FIXTURE_IDS.routesArtifactId,
  routesVersion = 1,
): SocialMediaOutputData {
  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output),
    creativeId: "creative_01",
    routesRef: {
      artifactId: routesArtifactId,
      version: routesVersion,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    },
    platformRef: {
      artifactId: SOCIAL_MEDIA_FIXTURE_IDS.platformArtifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    },
    sizeReferenceRef: {
      artifactId: SOCIAL_MEDIA_FIXTURE_IDS.sizeArtifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    },
    canvas: {
      widthPx: 1080,
      heightPx: 1350,
      coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
      source: "platform_default",
      elementLayoutUnresolved: true,
    },
    onImageCopy: {
      headline: "Energy that fits Tuesday",
      messageAngle: "Everyday energy",
      provenance: "ai_generated",
    },
    compositionNotes: "Product mid-frame; headline top-left safe zone",
    previewAssetRef: {
      vaultAssetId: SOCIAL_MEDIA_FIXTURE_IDS.vaultImage,
      role: "creative_preview",
      label: "Social creative PNG",
    },
    captionUnresolved: true,
    multiAssetUnresolved: true,
    sourceRefs: {
      executionId: "exec_social_fixture_1",
      upstreamArtifactRefs: [
        {
          artifactId: routesArtifactId,
          version: routesVersion,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        },
      ],
      vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage],
    },
  };
}
