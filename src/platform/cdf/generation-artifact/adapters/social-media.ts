/**
 * Social Media generation adapters (M9B) — provider envelope → canonical data.
 * Does NOT invent structure from image-only / URL-only / prose-only / art_* output.
 */

import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "../../artifacts/social-media/keys";
import type {
  SocialMediaOutputData,
  SocialMediaPlatform,
  SocialMediaPlatformData,
  SocialMediaRoutesData,
  SocialMediaSizePathKind,
  SocialMediaSizeReferenceData,
} from "../../artifacts/social-media/types";
import { SOCIAL_MEDIA_PLATFORMS } from "../../artifacts/social-media/types";
import {
  SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
} from "../../artifacts/social-media/coordinates";
import { rejectImageOnlySocialMediaEnvelope } from "../../artifacts/social-media/validate";
import { pickCreativeDirectionProductionFields } from "../../creative-direction/production-semantics";
import { generationArtifactError } from "../errors";
import {
  asString,
  assertVaultAssetIds,
  isRecord,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import { stableRouteId } from "../stable-ids";
import {
  classifySocialMediaProviderOutput,
  isSocialMediaCanonicalCapable,
} from "./social-media-capability";

export {
  classifySocialMediaProviderOutput,
  isSocialMediaCanonicalCapable,
  type SocialMediaProviderCapability,
} from "./social-media-capability";

export type SocialMediaExactRef = {
  artifactId: string;
  version: number;
  artifactKey?: string;
};

function requireExactRef(
  ref: SocialMediaExactRef | undefined,
  label: string,
): SocialMediaExactRef {
  if (!ref?.artifactId) {
    throw generationArtifactError(
      "SOCIAL_UPSTREAM_ARTIFACT_MISSING",
      `${label} requires exact artifactId`,
    );
  }
  if (!Number.isInteger(ref.version) || ref.version < 1) {
    throw generationArtifactError(
      "SOCIAL_UPSTREAM_VERSION_MISSING",
      `${label} requires exact integer version >= 1 (never latest/HEAD)`,
    );
  }
  return ref;
}

function assertNotImageOnly(raw: Record<string, unknown>, label: string): void {
  const r = rejectImageOnlySocialMediaEnvelope(raw, label);
  if (!r.ok) {
    throw generationArtifactError(
      "SOCIAL_CANONICALIZATION_UNSUPPORTED",
      r.message,
    );
  }
}

function mapPlatform(raw: string): SocialMediaPlatform | undefined {
  const lower = raw.trim().toLowerCase();
  if ((SOCIAL_MEDIA_PLATFORMS as readonly string[]).includes(lower)) {
    return lower as SocialMediaPlatform;
  }
  if (lower === "twitter" || lower === "x / twitter") return "x";
  if (lower.includes("instagram")) return "instagram";
  if (lower.includes("facebook")) return "facebook";
  if (lower.includes("linkedin")) return "linkedin";
  if (lower === "other" || lower.includes("another platform")) return "other";
  return undefined;
}

function mapSizePathKind(raw: string): SocialMediaSizePathKind | undefined {
  const lower = raw.trim().toLowerCase();
  if (
    lower === "enter_size" ||
    lower === "enter size" ||
    lower.includes("enter size") ||
    lower.includes("exact dimensions")
  ) {
    return "enter_size";
  }
  if (
    lower === "use_platform_size" ||
    lower === "use platform size" ||
    lower.includes("platform size") ||
    lower.includes("recommended size")
  ) {
    return "use_platform_size";
  }
  if (
    lower === "upload_reference" ||
    lower === "upload reference" ||
    lower.includes("upload reference") ||
    lower.includes("inspiration")
  ) {
    return "upload_reference";
  }
  if (lower === "skip" || lower.includes("without a custom")) {
    return "skip";
  }
  if (
    lower === "enter_size" ||
    lower === "use_platform_size" ||
    lower === "upload_reference" ||
    lower === "skip"
  ) {
    return lower as SocialMediaSizePathKind;
  }
  return undefined;
}

export function normalizeSocialMediaPlatform(
  raw: unknown,
): SocialMediaPlatformData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "social-media.platform"),
  );
  if (root.schemaId === socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.platform)) {
    return root as unknown as SocialMediaPlatformData;
  }

  const label =
    asString(root.label) ||
    asString(root.choice) ||
    asString(root.platform) ||
    asString(root.name) ||
    "";
  const platform =
    (typeof root.platform === "string" && mapPlatform(root.platform)) ||
    mapPlatform(label);

  if (!platform) {
    throw generationArtifactError(
      "SOCIAL_STRUCTURED_DATA_MISSING",
      "social-media.platform requires platform (instagram|facebook|linkedin|x|other) or a known config choice label",
    );
  }

  const platformId =
    asString(root.platformId) || `platform_${platform}`;

  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.platform),
    platformId,
    platform,
    label: label || platform,
    notes: asString(root.notes),
  };
}

export function normalizeSocialMediaSizeReference(
  raw: unknown,
  opts?: {
    platformRef?: SocialMediaExactRef;
    vaultAssetIds?: string[];
  },
): SocialMediaSizeReferenceData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "social-media.size-reference"),
  );
  if (
    root.schemaId ===
    socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference)
  ) {
    return root as unknown as SocialMediaSizeReferenceData;
  }

  const label =
    asString(root.label) ||
    asString(root.choice) ||
    asString(root.pathKind) ||
    "";
  let pathKind: SocialMediaSizePathKind | undefined =
    root.pathKind === "enter_size" ||
    root.pathKind === "use_platform_size" ||
    root.pathKind === "upload_reference" ||
    root.pathKind === "skip"
      ? root.pathKind
      : mapSizePathKind(label);

  if (!pathKind) {
    throw generationArtifactError(
      "SOCIAL_STRUCTURED_DATA_MISSING",
      "social-media.size-reference requires pathKind (enter_size|use_platform_size|upload_reference|skip) or a known config choice label",
    );
  }

  let canvas: SocialMediaSizeReferenceData["canvas"];
  if (isRecord(root.canvas)) {
    const w = root.canvas.widthPx;
    const h = root.canvas.heightPx;
    if (
      typeof w === "number" &&
      typeof h === "number" &&
      Number.isInteger(w) &&
      Number.isInteger(h) &&
      w > 0 &&
      h > 0
    ) {
      canvas = {
        widthPx: w,
        heightPx: h,
        coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
        source:
          root.canvas.source === "user_entered" ||
          root.canvas.source === "platform_default" ||
          root.canvas.source === "reference_asset" ||
          root.canvas.source === "production_spec" ||
          root.canvas.source === "unspecified"
            ? root.canvas.source
            : pathKind === "enter_size"
              ? "user_entered"
              : pathKind === "use_platform_size"
                ? "platform_default"
                : "unspecified",
        label: asString(root.canvas.label),
        elementLayoutUnresolved: true,
      };
    }
  } else if (
    typeof root.widthPx === "number" &&
    typeof root.heightPx === "number" &&
    Number.isInteger(root.widthPx) &&
    Number.isInteger(root.heightPx) &&
    root.widthPx > 0 &&
    root.heightPx > 0
  ) {
    canvas = {
      widthPx: root.widthPx as number,
      heightPx: root.heightPx as number,
      coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
      source: pathKind === "enter_size" ? "user_entered" : "unspecified",
      elementLayoutUnresolved: true,
    };
  }

  if (pathKind === "enter_size" && !canvas) {
    throw generationArtifactError(
      "SOCIAL_STRUCTURED_DATA_MISSING",
      "social-media.size-reference enter_size requires canvas widthPx/heightPx from configuration (dimensions are never invented)",
    );
  }

  const vaultIds = assertVaultAssetIds(
    opts?.vaultAssetIds ??
      (Array.isArray(root.vaultAssetIds)
        ? (root.vaultAssetIds as string[])
        : undefined),
  );

  const optionId =
    asString(root.optionId) || `size_option_${pathKind.replace(/_/g, "-")}`;

  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference),
    optionId,
    pathKind,
    canvas,
    referenceAssetRefs:
      pathKind === "upload_reference" && vaultIds.length
        ? vaultIds.map((vaultAssetId) => ({
            vaultAssetId,
            role: "reference_creative",
          }))
        : undefined,
    platformRef: opts?.platformRef
      ? {
          ...opts.platformRef,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
        }
      : undefined,
    formatHint: asString(root.formatHint),
    notes: asString(root.notes),
  };
}

export function normalizeSocialMediaRoutes(
  raw: unknown,
  opts?: {
    platformRef?: SocialMediaExactRef;
    sizeReferenceRef?: SocialMediaExactRef;
  },
): SocialMediaRoutesData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "social-media.routes"),
  );
  if (root.schemaId === socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.routes)) {
    return root as unknown as SocialMediaRoutesData;
  }
  if ("selected" in root || "approved" in root) {
    throw generationArtifactError(
      "SOCIAL_PROVIDER_OUTPUT_INVALID",
      "social-media.routes must not encode selection/approval at root",
    );
  }

  // Prose-only: never LLM-parse into structure
  if (
    !Array.isArray(root.routes) &&
    !Array.isArray(root.directions) &&
    (typeof root.text === "string" || typeof root.content === "string")
  ) {
    throw generationArtifactError(
      "SOCIAL_CANONICALIZATION_UNSUPPORTED",
      "social-media.routes prose-only output cannot be deterministically canonicalized (no LLM invent; structured routes[] required)",
    );
  }

  const list = Array.isArray(root.routes)
    ? root.routes
    : Array.isArray(root.directions)
      ? root.directions
      : null;
  if (!list || list.length !== 3) {
    throw generationArtifactError(
      "SOCIAL_STRUCTURED_DATA_MISSING",
      "social-media.routes requires exactly 3 structured routes[] (M9A cardinality); do not truncate/pad",
    );
  }

  const routes = list.map((item, i) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "SOCIAL_PROVIDER_OUTPUT_INVALID",
        `social-media.routes routes[${i}] must be object`,
      );
    }
    if ("selected" in item || "approved" in item) {
      throw generationArtifactError(
        "SOCIAL_PROVIDER_OUTPUT_INVALID",
        "routes[] must not encode selection/approval",
      );
    }
    const name =
      asString(item.name) || asString(item.title) || asString(item.label);
    if (!name) {
      throw generationArtifactError(
        "SOCIAL_STRUCTURED_DATA_MISSING",
        `social-media.routes routes[${i}].name required`,
      );
    }
    const routeId = stableRouteId(
      name,
      i,
      asString(item.routeId) || asString(item.id),
    );
    return {
      routeId,
      name,
      creativeIdea:
        asString(item.creativeIdea) || asString(item.idea) || asString(item.prompt),
      visualTreatment:
        asString(item.visualTreatment) ||
        asString(item.visual) ||
        asString(item.visualDirection),
      headlineAngle:
        asString(item.headlineAngle) ||
        asString(item.headline) ||
        asString(item.messageAngle),
      rationale:
        asString(item.rationale) ||
        asString(item.why) ||
        asString(item.designRationale),
      visualCharacteristics: Array.isArray(item.visualCharacteristics)
        ? (item.visualCharacteristics as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : undefined,
      ...pickCreativeDirectionProductionFields(item),
    };
  });

  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.routes),
    routes,
    platformRef: opts?.platformRef
      ? {
          ...opts.platformRef,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
        }
      : undefined,
    sizeReferenceRef: opts?.sizeReferenceRef
      ? {
          ...opts.sizeReferenceRef,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        }
      : undefined,
  };
}

export function normalizeSocialMediaOutput(
  raw: unknown,
  opts?: {
    routesRef?: SocialMediaExactRef;
    platformRef?: SocialMediaExactRef;
    sizeReferenceRef?: SocialMediaExactRef;
    vaultAssetIds?: string[];
  },
): SocialMediaOutputData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "social-media.output"),
  );
  assertNotImageOnly(root, "social-media.output");

  if (root.schemaId === socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output)) {
    const data = root as unknown as SocialMediaOutputData;
    // Still require routesRef pin from opts when schema payload omits it
    if (!data.routesRef && opts?.routesRef) {
      return {
        ...data,
        routesRef: {
          ...requireExactRef(opts.routesRef, "routesRef"),
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        },
      };
    }
    return data;
  }

  const vaultIds = assertVaultAssetIds(
    opts?.vaultAssetIds ??
      (Array.isArray(root.vaultAssetIds)
        ? (root.vaultAssetIds as string[])
        : undefined),
  );

  let previewVaultId: string | undefined;
  if (isRecord(root.previewAssetRef)) {
    const id = asString(root.previewAssetRef.vaultAssetId);
    if (id) {
      assertVaultAssetIds([id]);
      previewVaultId = id;
    }
  }
  if (!previewVaultId && vaultIds[0]) {
    previewVaultId = vaultIds[0];
  }

  if (!previewVaultId) {
    throw generationArtifactError(
      "SOCIAL_VAULT_ASSET_MISSING",
      "social-media.output requires a valid Vault ObjectId previewAssetRef (art_*/URL/exec_* are not canonical assets)",
    );
  }

  const routesRef = requireExactRef(
    opts?.routesRef ??
      (isRecord(root.routesRef)
        ? {
            artifactId: String(root.routesRef.artifactId ?? ""),
            version: Number(root.routesRef.version),
          }
        : undefined),
    "routesRef",
  );

  const creativeId =
    asString(root.creativeId) ||
    asString(root.id) ||
    "creative_01";

  let canvas: SocialMediaOutputData["canvas"];
  if (isRecord(root.canvas)) {
    const w = root.canvas.widthPx;
    const h = root.canvas.heightPx;
    if (
      typeof w === "number" &&
      typeof h === "number" &&
      Number.isInteger(w) &&
      Number.isInteger(h) &&
      w > 0 &&
      h > 0
    ) {
      canvas = {
        widthPx: w,
        heightPx: h,
        coordinateSystem: SOCIAL_MEDIA_PIXEL_COORDINATE_SYSTEM,
        source:
          typeof root.canvas.source === "string"
            ? (root.canvas.source as never)
            : "unspecified",
        elementLayoutUnresolved: true,
      };
    }
  }

  let onImageCopy: SocialMediaOutputData["onImageCopy"];
  if (isRecord(root.onImageCopy)) {
    onImageCopy = {
      headline: asString(root.onImageCopy.headline),
      messageAngle: asString(root.onImageCopy.messageAngle),
      provenance:
        root.onImageCopy.provenance === "user_provided" ||
        root.onImageCopy.provenance === "ai_generated" ||
        root.onImageCopy.provenance === "mixed" ||
        root.onImageCopy.provenance === "unknown"
          ? root.onImageCopy.provenance
          : "unknown",
    };
  } else if (asString(root.headline)) {
    onImageCopy = {
      headline: asString(root.headline),
      provenance: "unknown",
    };
  }

  return {
    schemaId: socialMediaSchemaId(SOCIAL_MEDIA_ARTIFACT_KEYS.output),
    creativeId,
    routesRef: {
      ...routesRef,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    },
    platformRef: opts?.platformRef
      ? {
          ...opts.platformRef,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
        }
      : undefined,
    sizeReferenceRef: opts?.sizeReferenceRef
      ? {
          ...opts.sizeReferenceRef,
          artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
        }
      : undefined,
    canvas,
    onImageCopy,
    compositionNotes: asString(root.compositionNotes),
    previewAssetRef: {
      vaultAssetId: previewVaultId,
      role: "creative_preview",
    },
    captionUnresolved: true,
    multiAssetUnresolved: true,
  };
}

export function normalizeToSocialMediaData(
  artifactKey: SocialMediaArtifactKey,
  raw: unknown,
  opts: {
    vaultAssetIds?: string[];
    platformRef?: SocialMediaExactRef;
    sizeReferenceRef?: SocialMediaExactRef;
    routesRef?: SocialMediaExactRef;
  } = {},
): Record<string, unknown> {
  const capability = classifySocialMediaProviderOutput(artifactKey, raw);
  if (!isSocialMediaCanonicalCapable(capability)) {
    throw generationArtifactError(
      "SOCIAL_CANONICALIZATION_UNSUPPORTED",
      `social-media canonicalization unsupported for ${artifactKey}: provider capability="${capability}" (structured Social Media state required; raster/URL/prose/art_*/exec envelopes are not canonical)`,
      { artifactKey, capability },
    );
  }

  switch (artifactKey) {
    case SOCIAL_MEDIA_ARTIFACT_KEYS.platform:
      return normalizeSocialMediaPlatform(raw) as unknown as Record<
        string,
        unknown
      >;
    case SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference:
      return normalizeSocialMediaSizeReference(raw, {
        platformRef: opts.platformRef,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case SOCIAL_MEDIA_ARTIFACT_KEYS.routes:
      return normalizeSocialMediaRoutes(raw, {
        platformRef: opts.platformRef,
        sizeReferenceRef: opts.sizeReferenceRef,
      }) as unknown as Record<string, unknown>;
    case SOCIAL_MEDIA_ARTIFACT_KEYS.output:
      return normalizeSocialMediaOutput(raw, {
        routesRef: opts.routesRef,
        platformRef: opts.platformRef,
        sizeReferenceRef: opts.sizeReferenceRef,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    default:
      throw generationArtifactError(
        "ARTIFACT_TARGET_UNRESOLVED",
        `No Social Media adapter for ${String(artifactKey)}`,
      );
  }
}
