/**
 * Deterministic Packaging artifact fixtures (M8A) — no AI providers.
 */

import {
  PACKAGING_PANEL_COORDINATE_SYSTEM,
  PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
  PACKAGING_VIEW_CAMERA_SYSTEM,
} from "./coordinates";
import {
  PACKAGING_ARTIFACT_KEYS,
  packagingSchemaId,
} from "./keys";
import type {
  Packaging3dDirectionData,
  PackagingCompletePackData,
  PackagingDielineData,
  PackagingFrontPackData,
  PackagingRoutesData,
  PackagingSkuAdaptationsData,
  PackagingViewsData,
} from "./types";

export const PACKAGING_FIXTURE_IDS = {
  dielineArtifactId: "cdfart_fixture_packaging_dieline_01",
  routesArtifactId: "cdfart_fixture_packaging_routes_01",
  threeDArtifactId: "cdfart_fixture_packaging_3d_01",
  frontArtifactId: "cdfart_fixture_packaging_front_01",
  completePackArtifactId: "cdfart_fixture_packaging_complete_01",
  viewsArtifactId: "cdfart_fixture_packaging_views_01",
  skuArtifactId: "cdfart_fixture_packaging_sku_01",
  vaultImage: "507f1f77bcf86cd799439011",
  vaultDieline: "507f1f77bcf86cd799439012",
} as const;

export function fixturePackagingDieline(): PackagingDielineData {
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.dieline),
    pathKind: "upload_dieline",
    packageType: "folding_carton",
    dimensions: {
      widthMm: 80,
      heightMm: 140,
      depthMm: 40,
      coordinateSystem: PACKAGING_PHYSICAL_COORDINATE_SYSTEM,
      geometryOriginUnresolved: true,
    },
    panels: [
      {
        id: "dieline_panel_01",
        name: "Front",
        role: "front",
        bounds: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          coordinateSystem: PACKAGING_PANEL_COORDINATE_SYSTEM,
        },
      },
      { id: "dieline_panel_02", name: "Back", role: "back" },
      { id: "dieline_panel_03", name: "Side", role: "side" },
    ],
    uploadedAssetRefs: [
      {
        vaultAssetId: PACKAGING_FIXTURE_IDS.vaultDieline,
        role: "dieline_file",
        label: "Vendor dieline PDF",
      },
    ],
    technicalNotes: ["Bleed 3mm", "Keep barcode clear"],
    geometryUnresolved: true,
    sourceRefs: {
      sourceInputIds: ["src_pack_fixture_1"],
      activeBriefId: "brief_pack_fixture_1",
      activeBriefVersion: 1,
      contextId: "ctx_pack_fixture_1",
      contextHash: "hash_pack_fixture_1",
    },
  };
}

export function fixturePackagingRoutes(
  dielineArtifactId: string = PACKAGING_FIXTURE_IDS.dielineArtifactId,
  dielineVersion = 1,
): PackagingRoutesData {
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.routes),
    routes: [
      {
        routeId: "route_01",
        name: "Tropical Punch",
        shelfIdea: "Bold fruit block with cold-press cue",
        hierarchyThought: "Flavor → brand → claim",
        visualDirection: "Saturated mango photography, clean sans lockup",
        designRationale: "Stand out in refrigerated beverage aisle",
        visualCharacteristics: ["high chroma", "minimal ornament"],
        typographyDirection: "Bold condensed brand; light claim",
        colorDirection: "Mango orange + deep green",
        imageryDirection: "Fresh cut fruit, condensation",
        packagingApplicationNotes: "Front panel hero fruit; side nutrition quiet",
      },
      {
        routeId: "route_02",
        name: "Modern Minimal",
        shelfIdea: "White ground, single accent stripe",
        hierarchyThought: "Brand first, flavor second",
        visualDirection: "Quiet premium",
        colorDirection: "Off-white + ink black + one accent",
      },
      {
        routeId: "route_03",
        name: "Heritage Craft",
        shelfIdea: "Paper texture, stamp marks",
        hierarchyThought: "Story then flavor",
        visualDirection: "Tactile craft cues",
      },
    ],
    selectedRouteId: "route_01",
    dielineRef: {
      artifactId: dielineArtifactId,
      version: dielineVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: dielineArtifactId,
          version: dielineVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        },
      ],
    },
  };
}

export function fixturePackaging3dDirection(opts?: {
  dielineArtifactId?: string;
  dielineVersion?: number;
  routesArtifactId?: string;
  routesVersion?: number;
}): Packaging3dDirectionData {
  const dielineArtifactId =
    opts?.dielineArtifactId ?? PACKAGING_FIXTURE_IDS.dielineArtifactId;
  const dielineVersion = opts?.dielineVersion ?? 1;
  const routesArtifactId =
    opts?.routesArtifactId ?? PACKAGING_FIXTURE_IDS.routesArtifactId;
  const routesVersion = opts?.routesVersion ?? 1;
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.threeDDirection),
    candidates: [
      {
        id: "direction_01",
        name: "Three-quarter shelf",
        visualIntent: "Pack standing, front-left three-quarter, soft key light",
        packageFormNotes: "Folding carton with rounded shoulder",
        cameraNotes: "Eye-level, slight downward tilt",
        lightingNotes: "Softbox key, cool fill",
        previewAssetRef: {
          vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
          role: "preview",
        },
      },
      {
        id: "direction_02",
        name: "Straight-on front",
        visualIntent: "Orthographic front for artwork review",
      },
      {
        id: "direction_03",
        name: "Lifestyle angle",
        visualIntent: "Pack in hand context, shallow DOF",
      },
    ],
    selectedCandidateId: "direction_01",
    dielineRef: {
      artifactId: dielineArtifactId,
      version: dielineVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    routesRef: {
      artifactId: routesArtifactId,
      version: routesVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    structuredSceneUnresolved: true,
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: dielineArtifactId,
          version: dielineVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        },
        {
          artifactId: routesArtifactId,
          version: routesVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        },
      ],
      vaultAssetIds: [PACKAGING_FIXTURE_IDS.vaultImage],
    },
  };
}

export function fixturePackagingFrontPack(opts?: {
  routesArtifactId?: string;
  routesVersion?: number;
  threeDArtifactId?: string;
  threeDVersion?: number;
  dielineArtifactId?: string;
  dielineVersion?: number;
}): PackagingFrontPackData {
  const routesArtifactId =
    opts?.routesArtifactId ?? PACKAGING_FIXTURE_IDS.routesArtifactId;
  const routesVersion = opts?.routesVersion ?? 1;
  const threeDArtifactId =
    opts?.threeDArtifactId ?? PACKAGING_FIXTURE_IDS.threeDArtifactId;
  const threeDVersion = opts?.threeDVersion ?? 1;
  const dielineArtifactId =
    opts?.dielineArtifactId ?? PACKAGING_FIXTURE_IDS.dielineArtifactId;
  const dielineVersion = opts?.dielineVersion ?? 1;
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.frontPack),
    frontId: "package_surface_front",
    compositionNotes: "Centered brand lockup over fruit hero",
    brandLockupNotes: "Wordmark top third",
    variantNameNotes: "Masala Mango — mid weight",
    mandatoryCopy: ["Net weight 250ml"],
    dielineRef: {
      artifactId: dielineArtifactId,
      version: dielineVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    routesRef: {
      artifactId: routesArtifactId,
      version: routesVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    threeDDirectionRef: {
      artifactId: threeDArtifactId,
      version: threeDVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    },
    previewAssetRef: {
      vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
      role: "front_preview",
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: routesArtifactId,
          version: routesVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        },
        {
          artifactId: threeDArtifactId,
          version: threeDVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        },
      ],
    },
  };
}

export function fixturePackagingCompletePack(opts?: {
  dielineArtifactId?: string;
  dielineVersion?: number;
  routesArtifactId?: string;
  routesVersion?: number;
  threeDArtifactId?: string;
  threeDVersion?: number;
  frontArtifactId?: string;
  frontVersion?: number;
}): PackagingCompletePackData {
  const dielineArtifactId =
    opts?.dielineArtifactId ?? PACKAGING_FIXTURE_IDS.dielineArtifactId;
  const dielineVersion = opts?.dielineVersion ?? 1;
  const routesArtifactId =
    opts?.routesArtifactId ?? PACKAGING_FIXTURE_IDS.routesArtifactId;
  const routesVersion = opts?.routesVersion ?? 1;
  const threeDArtifactId =
    opts?.threeDArtifactId ?? PACKAGING_FIXTURE_IDS.threeDArtifactId;
  const threeDVersion = opts?.threeDVersion ?? 1;
  const frontArtifactId =
    opts?.frontArtifactId ?? PACKAGING_FIXTURE_IDS.frontArtifactId;
  const frontVersion = opts?.frontVersion ?? 1;
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.completePack),
    surfaces: [
      { id: "package_surface_front", role: "front" },
      { id: "package_surface_back", role: "back" },
      { id: "package_surface_side", role: "side" },
      { id: "package_surface_flat", role: "flat" },
    ],
    dielineRef: {
      artifactId: dielineArtifactId,
      version: dielineVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    },
    routesRef: {
      artifactId: routesArtifactId,
      version: routesVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    },
    threeDDirectionRef: {
      artifactId: threeDArtifactId,
      version: threeDVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    },
    frontPackRef: {
      artifactId: frontArtifactId,
      version: frontVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: dielineArtifactId,
          version: dielineVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        },
        {
          artifactId: routesArtifactId,
          version: routesVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        },
        {
          artifactId: threeDArtifactId,
          version: threeDVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        },
        {
          artifactId: frontArtifactId,
          version: frontVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        },
      ],
    },
  };
}

export function fixturePackagingViews(
  completePackArtifactId: string = PACKAGING_FIXTURE_IDS.completePackArtifactId,
  completePackVersion = 1,
): PackagingViewsData {
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.views),
    views: [
      {
        id: "view_01",
        name: "Front three-quarter",
        purpose: "Primary hero",
        camera: {
          coordinateSystem: PACKAGING_VIEW_CAMERA_SYSTEM,
          azimuthDeg: 35,
          elevationDeg: 15,
        },
        previewAssetRef: {
          vaultAssetId: PACKAGING_FIXTURE_IDS.vaultImage,
          role: "view_preview",
        },
      },
      {
        id: "view_02",
        name: "Back panel",
        purpose: "Regulatory / nutrition",
      },
      {
        id: "view_03",
        name: "Flat dieline view",
        purpose: "Production review",
      },
    ],
    completePackRef: {
      artifactId: completePackArtifactId,
      version: completePackVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: completePackArtifactId,
          version: completePackVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
        },
      ],
    },
  };
}

export function fixturePackagingSkuAdaptations(opts?: {
  viewsArtifactId?: string;
  viewsVersion?: number;
  completePackArtifactId?: string;
  completePackVersion?: number;
}): PackagingSkuAdaptationsData {
  const viewsArtifactId =
    opts?.viewsArtifactId ?? PACKAGING_FIXTURE_IDS.viewsArtifactId;
  const viewsVersion = opts?.viewsVersion ?? 1;
  const completePackArtifactId =
    opts?.completePackArtifactId ?? PACKAGING_FIXTURE_IDS.completePackArtifactId;
  const completePackVersion = opts?.completePackVersion ?? 1;
  return {
    schemaId: packagingSchemaId(PACKAGING_ARTIFACT_KEYS.skuAdaptations),
    skus: [
      {
        id: "sku_01",
        label: "Masala Mango 250ml",
        variantName: "Masala Mango",
        variantAttribute: "250ml",
      },
      {
        id: "sku_02",
        label: "Masala Mango 500ml",
        variantName: "Masala Mango",
        variantAttribute: "500ml",
        artworkOverrideNotes: "Scale lockup for taller panel",
      },
      {
        id: "sku_03",
        label: "Guava Chill 250ml",
        variantName: "Guava Chill",
        variantAttribute: "250ml",
      },
      {
        id: "sku_04",
        label: "Guava Chill 500ml",
        variantName: "Guava Chill",
        variantAttribute: "500ml",
      },
    ],
    viewsRef: {
      artifactId: viewsArtifactId,
      version: viewsVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.views,
    },
    completePackRef: {
      artifactId: completePackArtifactId,
      version: completePackVersion,
      artifactKey: PACKAGING_ARTIFACT_KEYS.completePack,
    },
    sourceRefs: {
      upstreamArtifactRefs: [
        {
          artifactId: viewsArtifactId,
          version: viewsVersion,
          artifactKey: PACKAGING_ARTIFACT_KEYS.views,
        },
      ],
    },
  };
}
