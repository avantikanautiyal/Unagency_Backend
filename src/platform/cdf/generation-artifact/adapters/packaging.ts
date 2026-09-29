/**
 * Packaging generation adapters (M8A) — provider envelope → canonical data.
 * Does NOT invent structure from image-only / URL-only / execution-only output.
 */

import {
  PACKAGING_ARTIFACT_KEYS,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "../../artifacts/packaging/keys";
import type {
  Packaging3dDirectionData,
  PackagingCompletePackData,
  PackagingDielineData,
  PackagingFrontPackData,
  PackagingRoutesData,
  PackagingSkuAdaptationsData,
  PackagingViewsData,
} from "../../artifacts/packaging/types";
import {
  PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
  PACKAGING_VIEW_CAMERA_SYSTEM,
} from "../../artifacts/packaging/coordinates";
import { rejectImageOnlyPackagingEnvelope } from "../../artifacts/packaging/validate";
import { generationArtifactError } from "../errors";
import { pickCreativeDirectionProductionFields } from "../../creative-direction/production-semantics";
import {
  asString,
  assertVaultAssetIds,
  isRecord,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import {
  classifyPackagingProviderOutput,
  isPackagingCanonicalCapable,
} from "./packaging-capability";

export {
  classifyPackagingProviderOutput,
  isPackagingCanonicalCapable,
  type PackagingProviderCapability,
} from "./packaging-capability";

export type PackagingExactRef = {
  artifactId: string;
  version: number;
  artifactKey?: string;
};

function requireExactRef(
  ref: PackagingExactRef | undefined,
  label: string,
): PackagingExactRef {
  if (!ref?.artifactId || !Number.isInteger(ref.version) || ref.version < 1) {
    throw generationArtifactError(
      "ARTIFACT_DEPENDENCY_MISSING",
      `${label} requires exact artifactId+version`,
    );
  }
  return ref;
}

function assertNotImageOnly(raw: Record<string, unknown>, label: string): void {
  const r = rejectImageOnlyPackagingEnvelope(raw, label);
  if (!r.ok) {
    throw generationArtifactError(
      "PACKAGING_CANONICALIZATION_UNSUPPORTED",
      r.message,
    );
  }
}

export function normalizePackagingDieline(
  raw: unknown,
): PackagingDielineData {
  const root = unwrapProviderEnvelope(requireRecord(raw, "packaging.dieline"));
  if (root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline)) {
    return root as unknown as PackagingDielineData;
  }

  // Image/PDF/URL-only is not structured dieline geometry — and must not
  // silently coerce to pathKind "none".
  const img = rejectImageOnlyPackagingEnvelope(root, "packaging.dieline");
  if (!img.ok) {
    throw generationArtifactError(
      "PACKAGING_CANONICALIZATION_UNSUPPORTED",
      img.message,
    );
  }

  const pathRaw =
    asString(root.pathKind) ||
    asString(root.choice) ||
    asString(root.label) ||
    "";
  let pathKind: PackagingDielineData["pathKind"] | undefined;
  const lower = pathRaw.toLowerCase();
  if (
    root.pathKind === "upload_dieline" ||
    root.pathKind === "none" ||
    root.pathKind === "existing_pack"
  ) {
    pathKind = root.pathKind;
  } else if (lower.includes("existing")) pathKind = "existing_pack";
  else if (lower.includes("upload") || lower.includes("dieline")) {
    pathKind = "upload_dieline";
  } else if (
    lower.includes("don't") ||
    lower.includes("dont") ||
    lower === "none" ||
    lower.includes("don't have") ||
    lower.includes("i don't have")
  ) {
    pathKind = "none";
  }

  if (!pathKind) {
    throw generationArtifactError(
      "PACKAGING_CANONICALIZATION_UNSUPPORTED",
      "packaging.dieline requires pathKind (upload_dieline|none|existing_pack) or a config choice label; structured geometry is unresolved and must not be invented",
    );
  }

  const vaultIds = assertVaultAssetIds(
    Array.isArray(root.vaultAssetIds)
      ? (root.vaultAssetIds as string[])
      : undefined,
  );

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline),
    pathKind,
    packageType: asString(root.packageType),
    dimensions:
      isRecord(root.dimensions) &&
      typeof root.dimensions.widthMm === "number" &&
      typeof root.dimensions.heightMm === "number"
        ? {
            widthMm: root.dimensions.widthMm as number,
            heightMm: root.dimensions.heightMm as number,
            depthMm:
              typeof root.dimensions.depthMm === "number"
                ? (root.dimensions.depthMm as number)
                : undefined,
            coordinateSystem: PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
            geometryOriginUnresolved: true,
          }
        : undefined,
    uploadedAssetRefs: vaultIds.map((vaultAssetId) => ({ vaultAssetId })),
    geometryUnresolved: true,
  };
}

export function normalizePackagingRoutes(
  raw: unknown,
  opts?: {
    dielineRef?: PackagingExactRef;
    vaultAssetIds?: string[];
  },
): PackagingRoutesData {
  const root = unwrapProviderEnvelope(requireRecord(raw, "packaging.routes"));
  if (root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes)) {
    return root as unknown as PackagingRoutesData;
  }
  if ("selected" in root || "approved" in root) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "packaging.routes must not encode selection/approval at root",
    );
  }

  const list = Array.isArray(root.routes)
    ? root.routes
    : Array.isArray(root.directions)
      ? root.directions
      : null;
  if (!list || list.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "packaging.routes requires routes[] with structured fields",
    );
  }

  const routes = list.map((item, i) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `packaging.routes routes[${i}] must be object`,
      );
    }
    if ("selected" in item || "approved" in item) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        "routes[] must not encode selection/approval",
      );
    }
    const name =
      asString(item.name) || asString(item.title) || asString(item.label);
    if (!name) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `routes[${i}].name required`,
      );
    }
    const routeId =
      asString(item.routeId) ||
      asString(item.id) ||
      `route_${String(i + 1).padStart(2, "0")}`;
    return {
      routeId,
      name,
      shelfIdea: asString(item.shelfIdea) || asString(item.desc),
      hierarchyThought: asString(item.hierarchyThought),
      visualDirection: asString(item.visualDirection) || asString(item.description),
      designRationale: asString(item.designRationale) || asString(item.rationale),
      typographyDirection: asString(item.typographyDirection),
      colorDirection: asString(item.colorDirection),
      imageryDirection: asString(item.imageryDirection),
      packagingApplicationNotes: asString(item.packagingApplicationNotes),
      representativeAssetIds: assertVaultAssetIds(
        Array.isArray(item.representativeAssetIds)
          ? (item.representativeAssetIds as string[])
          : opts?.vaultAssetIds,
      ),
      ...pickCreativeDirectionProductionFields(item),
    };
  });

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes),
    routes,
    dielineRef: opts?.dielineRef
      ? {
          ...opts.dielineRef,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        }
      : undefined,
  };
}

export function normalizePackaging3dDirection(
  raw: unknown,
  opts: {
    dielineRef: PackagingExactRef;
    routesRef: PackagingExactRef;
    vaultAssetIds?: string[];
  },
): Packaging3dDirectionData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "packaging.3d-direction"),
  );
  if (
    root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection)
  ) {
    return root as unknown as Packaging3dDirectionData;
  }

  let list = Array.isArray(root.candidates)
    ? root.candidates
    : Array.isArray(root.directions)
      ? root.directions
      : null;

  // Image-bridge vault seed: elevate one preview into a single candidate so
  // fanout leaves can form leaf-scoped ArtifactVersions (not inventing routes).
  if ((!list || list.length < 1) && opts.vaultAssetIds?.length) {
    const vaultFallback = assertVaultAssetIds(opts.vaultAssetIds);
    const previewId = vaultFallback[0];
    const name =
      asString(root.name) ||
      asString(root.title) ||
      asString(root.label) ||
      "3D Direction";
    const visualIntent =
      asString(root.visualIntent) ||
      asString(root.description) ||
      asString(root.intent) ||
      "Pack three-quarter product visualization for the selected design route";
    if (previewId) {
      list = [
        {
          id: "direction_01",
          name,
          visualIntent,
          previewAssetRef: { vaultAssetId: previewId, role: "preview" },
        },
      ];
    }
  }

  if (!list || list.length < 1) {
    assertNotImageOnly(root, "packaging.3d-direction");
    throw generationArtifactError(
      "PACKAGING_CANONICALIZATION_UNSUPPORTED",
      "packaging.3d-direction requires candidates[] with visualIntent — raster/preview-only is not structured 3D state",
    );
  }

  const vaultFallback = assertVaultAssetIds(opts.vaultAssetIds);
  const candidates = list.map((item, i) => {
    if (!isRecord(item)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `candidates[${i}] must be object`,
      );
    }
    const name =
      asString(item.name) || asString(item.title) || asString(item.label);
    const visualIntent =
      asString(item.visualIntent) ||
      asString(item.description) ||
      asString(item.intent);
    if (!name || !visualIntent) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `candidates[${i}] requires name + visualIntent`,
      );
    }
    const id =
      asString(item.id) || `direction_${String(i + 1).padStart(2, "0")}`;
    const previewId =
      asString(item.vaultAssetId) ||
      (vaultFallback[i] ?? vaultFallback[0]);
    return {
      id,
      name,
      visualIntent,
      packageFormNotes: asString(item.packageFormNotes),
      cameraNotes: asString(item.cameraNotes),
      lightingNotes: asString(item.lightingNotes),
      materialNotes: asString(item.materialNotes),
      previewAssetRef: previewId
        ? { vaultAssetId: previewId, role: "preview" }
        : undefined,
    };
  });

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection),
    candidates,
    dielineRef: {
      ...requireExactRef(opts.dielineRef, "dielineRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    routesRef: {
      ...requireExactRef(opts.routesRef, "routesRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    structuredSceneUnresolved: true,
  };
}

export function normalizePackagingFrontPack(
  raw: unknown,
  opts: {
    routesRef: PackagingExactRef;
    threeDDirectionRef: PackagingExactRef;
    dielineRef?: PackagingExactRef;
    vaultAssetIds?: string[];
  },
): PackagingFrontPackData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "packaging.front-pack"),
  );
  assertNotImageOnly(root, "packaging.front-pack");
  if (root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack)) {
    return root as unknown as PackagingFrontPackData;
  }
  const frontId =
    asString(root.frontId) || asString(root.id) || "package_surface_front";
  const vaultIds = assertVaultAssetIds(opts.vaultAssetIds);

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack),
    frontId,
    compositionNotes: asString(root.compositionNotes) || asString(root.description),
    brandLockupNotes: asString(root.brandLockupNotes),
    variantNameNotes: asString(root.variantNameNotes),
    routesRef: {
      ...requireExactRef(opts.routesRef, "routesRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    threeDDirectionRef: {
      ...requireExactRef(opts.threeDDirectionRef, "threeDDirectionRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    },
    dielineRef: opts.dielineRef
      ? {
          ...opts.dielineRef,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        }
      : undefined,
    previewAssetRef: vaultIds[0]
      ? { vaultAssetId: vaultIds[0], role: "front_preview" }
      : undefined,
  };
}

export function normalizePackagingCompletePack(
  raw: unknown,
  opts: {
    dielineRef: PackagingExactRef;
    routesRef: PackagingExactRef;
    threeDDirectionRef: PackagingExactRef;
    frontPackRef: PackagingExactRef;
  },
): PackagingCompletePackData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "packaging.complete-pack"),
  );
  assertNotImageOnly(root, "packaging.complete-pack");
  if (
    root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.completePack)
  ) {
    return root as unknown as PackagingCompletePackData;
  }
  const surfacesRaw = Array.isArray(root.surfaces) ? root.surfaces : null;
  if (!surfacesRaw || surfacesRaw.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "packaging.complete-pack requires surfaces[] (image-only rejected)",
    );
  }
  const surfaces = surfacesRaw.map((s, i) => {
    if (!isRecord(s)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `surfaces[${i}] must be object`,
      );
    }
    const id =
      asString(s.id) || `package_surface_${String(i + 1).padStart(2, "0")}`;
    const role = (asString(s.role) || "other") as
      | "front"
      | "back"
      | "side"
      | "top"
      | "bottom"
      | "flat"
      | "other";
    return { id, role, notes: asString(s.notes) };
  });

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.completePack),
    surfaces,
    dielineRef: {
      ...requireExactRef(opts.dielineRef, "dielineRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    routesRef: {
      ...requireExactRef(opts.routesRef, "routesRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    threeDDirectionRef: {
      ...requireExactRef(opts.threeDDirectionRef, "threeDDirectionRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    },
    frontPackRef: {
      ...requireExactRef(opts.frontPackRef, "frontPackRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
    },
  };
}

export function normalizePackagingViews(
  raw: unknown,
  opts: { completePackRef: PackagingExactRef; vaultAssetIds?: string[] },
): PackagingViewsData {
  const root = unwrapProviderEnvelope(requireRecord(raw, "packaging.views"));
  assertNotImageOnly(root, "packaging.views");
  if (root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views)) {
    return root as unknown as PackagingViewsData;
  }
  const list = Array.isArray(root.views) ? root.views : null;
  if (!list || list.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "packaging.views requires views[] specs (image-only rejected)",
    );
  }
  const vaultIds = assertVaultAssetIds(opts.vaultAssetIds);
  const views = list.map((v, i) => {
    if (!isRecord(v)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `views[${i}] must be object`,
      );
    }
    const name = asString(v.name) || asString(v.title) || `View ${i + 1}`;
    const id = asString(v.id) || `view_${String(i + 1).padStart(2, "0")}`;
    return {
      id,
      name,
      purpose: asString(v.purpose),
      camera: isRecord(v.camera)
        ? {
            coordinateSystem: PACKAGING_VIEW_CAMERA_SYSTEM,
            azimuthDeg:
              typeof v.camera.azimuthDeg === "number"
                ? v.camera.azimuthDeg
                : undefined,
            elevationDeg:
              typeof v.camera.elevationDeg === "number"
                ? v.camera.elevationDeg
                : undefined,
          }
        : undefined,
      previewAssetRef: vaultIds[i]
        ? { vaultAssetId: vaultIds[i]!, role: "view_preview" }
        : undefined,
    };
  });

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views),
    views,
    completePackRef: {
      ...requireExactRef(opts.completePackRef, "completePackRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
    },
  };
}

export function normalizePackagingSkuAdaptations(
  raw: unknown,
  opts: {
    viewsRef: PackagingExactRef;
    completePackRef?: PackagingExactRef;
  },
): PackagingSkuAdaptationsData {
  const root = unwrapProviderEnvelope(
    requireRecord(raw, "packaging.sku-adaptations"),
  );
  assertNotImageOnly(root, "packaging.sku-adaptations");
  if (
    root.schemaId === packagingSchemaId(PACKAGING_ARTIFACT_KEYS.skuAdaptations)
  ) {
    return root as unknown as PackagingSkuAdaptationsData;
  }
  const list = Array.isArray(root.skus) ? root.skus : null;
  if (!list || list.length < 1) {
    throw generationArtifactError(
      "ARTIFACT_NORMALIZATION_FAILED",
      "packaging.sku-adaptations requires skus[] (image-only rejected)",
    );
  }
  const skus = list.map((s, i) => {
    if (!isRecord(s)) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `skus[${i}] must be object`,
      );
    }
    const label = asString(s.label) || asString(s.name) || asString(s.title);
    if (!label) {
      throw generationArtifactError(
        "ARTIFACT_NORMALIZATION_FAILED",
        `skus[${i}].label required`,
      );
    }
    return {
      id: asString(s.id) || `sku_${String(i + 1).padStart(2, "0")}`,
      label,
      variantName: asString(s.variantName),
      variantAttribute: asString(s.variantAttribute) || asString(s.size),
      artworkOverrideNotes: asString(s.artworkOverrideNotes),
    };
  });

  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.skuAdaptations),
    skus,
    viewsRef: {
      ...requireExactRef(opts.viewsRef, "viewsRef"),
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
    },
    completePackRef: opts.completePackRef
      ? {
          ...opts.completePackRef,
          artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
        }
      : undefined,
  };
}

export function normalizeToPackagingData(
  artifactKey: PackagingArtifactKey,
  raw: unknown,
  opts: {
    vaultAssetIds?: string[];
    dielineRef?: PackagingExactRef;
    routesRef?: PackagingExactRef;
    threeDDirectionRef?: PackagingExactRef;
    frontPackRef?: PackagingExactRef;
    completePackRef?: PackagingExactRef;
    viewsRef?: PackagingExactRef;
  } = {},
): Record<string, unknown> {
  const capability = classifyPackagingProviderOutput(artifactKey, raw);
  if (!isPackagingCanonicalCapable(capability)) {
    throw generationArtifactError(
      "PACKAGING_CANONICALIZATION_UNSUPPORTED",
      `packaging canonicalization unsupported for ${artifactKey}: provider capability="${capability}" (structured Packaging state required; raster/URL/prose/art_*/exec envelopes are not canonical)`,
      { artifactKey, capability },
    );
  }

  switch (artifactKey) {
    case PACKAGING_ARTIFACT_KEYS.dieline:
      return normalizePackagingDieline(raw) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.routes:
      return normalizePackagingRoutes(raw, {
        dielineRef: opts.dielineRef,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.threeDDirection:
      return normalizePackaging3dDirection(raw, {
        dielineRef: requireExactRef(opts.dielineRef, "dielineRef"),
        routesRef: requireExactRef(opts.routesRef, "routesRef"),
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.frontPack:
      return normalizePackagingFrontPack(raw, {
        routesRef: requireExactRef(opts.routesRef, "routesRef"),
        threeDDirectionRef: requireExactRef(
          opts.threeDDirectionRef,
          "threeDDirectionRef",
        ),
        dielineRef: opts.dielineRef,
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.completePack:
      return normalizePackagingCompletePack(raw, {
        dielineRef: requireExactRef(opts.dielineRef, "dielineRef"),
        routesRef: requireExactRef(opts.routesRef, "routesRef"),
        threeDDirectionRef: requireExactRef(
          opts.threeDDirectionRef,
          "threeDDirectionRef",
        ),
        frontPackRef: requireExactRef(opts.frontPackRef, "frontPackRef"),
      }) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.views:
      return normalizePackagingViews(raw, {
        completePackRef: requireExactRef(opts.completePackRef, "completePackRef"),
        vaultAssetIds: opts.vaultAssetIds,
      }) as unknown as Record<string, unknown>;
    case PACKAGING_ARTIFACT_KEYS.skuAdaptations:
      return normalizePackagingSkuAdaptations(raw, {
        viewsRef: requireExactRef(opts.viewsRef, "viewsRef"),
        completePackRef: opts.completePackRef,
      }) as unknown as Record<string, unknown>;
    default:
      throw generationArtifactError(
        "ARTIFACT_TARGET_UNRESOLVED",
        `No packaging adapter for ${String(artifactKey)}`,
      );
  }
}
