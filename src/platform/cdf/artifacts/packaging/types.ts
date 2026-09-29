/**
 * Packaging artifact data schemas (M8A).
 * These are Artifact.data payloads — not the M3A envelope.
 *
 * Rule: generated raster (PNG/JPG/WEBP) is a representation/asset, not
 * automatically the canonical creative state.
 */

import type {
  PackagingPanelBounds,
  PackagingPhysicalDimensions,
  PackagingViewCamera,
} from "./coordinates";
import type { PackagingArtifactKey } from "./keys";

/** Shared provenance refs inside creative data (IDs only). */
export type PackagingSourceRefs = {
  sourceInputIds?: string[];
  requirementIds?: string[];
  activeBriefId?: string;
  activeBriefVersion?: number;
  contextId?: string;
  contextHash?: string;
  /** Provenance only — never asset/artifact identity. */
  executionId?: string;
  upstreamArtifactRefs?: Array<{
    artifactId: string;
    version: number;
    artifactKey: string;
  }>;
  /** Vault ObjectIds (24-hex) — never cdfart_* or exec_*. */
  vaultAssetIds?: string[];
};

/** Exact version pin — never "latest". */
export type PackagingExactArtifactRef = {
  artifactId: string;
  version: number;
  artifactKey?: PackagingArtifactKey | string;
};

/** Optional preview/render asset — representation, not SoT. */
export type PackagingPreviewAssetRef = {
  vaultAssetId: string;
  role?: string;
  label?: string;
};

// ─── packaging.dieline ─────────────────────────────────────────────────────

/**
 * Dieline path from M1 config gate:
 * Upload Dieline | I Don't Have One | Upload Existing Pack
 *
 * Legacy runtime does not persist structured geometry — only choice + uploads.
 * Fields below model what the workflow/contract need; geometry paths are optional
 * and marked unresolved when absent.
 */
export type PackagingDielinePathKind =
  | "upload_dieline"
  | "none"
  | "existing_pack";

export type PackagingDielinePanel = {
  id: string;
  name?: string;
  role?: "front" | "back" | "side" | "top" | "bottom" | "flap" | "other";
  bounds?: PackagingPanelBounds;
};

export type PackagingDielineData = {
  schemaId: string;
  pathKind: PackagingDielinePathKind;
  /** Free-text pack form when known (box, pouch, bottle…) — not a closed enum yet. */
  packageType?: string;
  dimensions?: PackagingPhysicalDimensions;
  panels?: PackagingDielinePanel[];
  /** Vault refs for uploaded dieline / existing pack files. */
  uploadedAssetRefs?: PackagingPreviewAssetRef[];
  technicalNotes?: string[];
  /**
   * Explicit: structured cut/fold path geometry is UNRESOLVED in current runtime.
   * When true, consumers must not assume panel paths exist.
   */
  geometryUnresolved?: true;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.routes (design directions) ──────────────────────────────────

export type PackagingDesignRoute = {
  routeId: string;
  name: string;
  /** Shelf / pack idea — matches M1 route card fields. */
  shelfIdea?: string;
  hierarchyThought?: string;
  visualDirection?: string;
  designRationale?: string;
  visualCharacteristics?: string[];
  typographyDirection?: string;
  colorDirection?: string;
  imageryDirection?: string;
  packagingApplicationNotes?: string;
  representativeAssetIds?: string[];
  /** Shared optional production semantics (generic creative-direction contract). */
  communicationObjective?: string;
  primaryMessage?: string;
  secondaryMessage?: string;
  visualConcept?: string;
  focalPoint?: string;
  composition?: string;
  hierarchy?: string;
  supportingVisualElements?: string;
  brandIntegration?: string;
  identityMarkRole?: string;
  audienceSignal?: string;
  useContextIntent?: string;
  avoidances?: string;
};

/**
 * Candidate set for the routes phase.
 * Selection of a route is M3A lifecycle + selectedRouteId — not "displayed".
 */
export type PackagingRoutesData = {
  schemaId: string;
  routes: PackagingDesignRoute[];
  /**
   * Set only when user explicitly selects a route (backend authoritative).
   * Must reference an existing routes[].routeId. Absent ≠ selected.
   */
  selectedRouteId?: string;
  dielineRef?: PackagingExactArtifactRef;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.3d-direction ────────────────────────────────────────────────

/**
 * Structured 3D direction candidates.
 * A lone image URL is NOT sufficient canonical state (see validate).
 */
export type Packaging3dDirectionCandidate = {
  id: string;
  name: string;
  visualIntent: string;
  packageFormNotes?: string;
  cameraNotes?: string;
  lightingNotes?: string;
  materialNotes?: string;
  previewAssetRef?: PackagingPreviewAssetRef;
};

export type Packaging3dDirectionData = {
  schemaId: string;
  candidates: Packaging3dDirectionCandidate[];
  /** Explicit selection among candidates (≠ approval). */
  selectedCandidateId?: string;
  dielineRef: PackagingExactArtifactRef;
  routesRef: PackagingExactArtifactRef;
  /**
   * Must be true when no structured geometry/scene exists — only direction intent.
   * Legacy generators return raster previews only.
   */
  structuredSceneUnresolved?: true;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.front-pack ──────────────────────────────────────────────────

/**
 * Front pack = front-facing pack artwork / front design composition
 * (M1 label: "Front Pack" / outputLabel "Front Pack"), not a generic product photo.
 */
export type PackagingFrontPackData = {
  schemaId: string;
  /** Stable surface id, e.g. package_surface_front */
  frontId: string;
  compositionNotes?: string;
  brandLockupNotes?: string;
  variantNameNotes?: string;
  mandatoryCopy?: string[];
  dielineRef?: PackagingExactArtifactRef;
  routesRef: PackagingExactArtifactRef;
  threeDDirectionRef: PackagingExactArtifactRef;
  previewAssetRef?: PackagingPreviewAssetRef;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.complete-pack ───────────────────────────────────────────────

export type PackagingCompletePackSurface = {
  id: string;
  role: "front" | "back" | "side" | "top" | "bottom" | "flat" | "other";
  notes?: string;
  previewAssetRef?: PackagingPreviewAssetRef;
};

export type PackagingCompletePackData = {
  schemaId: string;
  surfaces: PackagingCompletePackSurface[];
  dielineRef: PackagingExactArtifactRef;
  routesRef: PackagingExactArtifactRef;
  threeDDirectionRef: PackagingExactArtifactRef;
  frontPackRef: PackagingExactArtifactRef;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.views ───────────────────────────────────────────────────────

export type PackagingViewSpec = {
  id: string;
  name: string;
  purpose?: string;
  camera?: PackagingViewCamera;
  previewAssetRef?: PackagingPreviewAssetRef;
};

export type PackagingViewsData = {
  schemaId: string;
  views: PackagingViewSpec[];
  completePackRef: PackagingExactArtifactRef;
  sourceRefs?: PackagingSourceRefs;
};

// ─── packaging.sku-adaptations ─────────────────────────────────────────────

export type PackagingSku = {
  id: string;
  label: string;
  variantName?: string;
  /** Flavor / size / color when the brief supplies it — not invented enums. */
  variantAttribute?: string;
  artworkOverrideNotes?: string;
  previewAssetRef?: PackagingPreviewAssetRef;
};

export type PackagingSkuAdaptationsData = {
  schemaId: string;
  skus: PackagingSku[];
  viewsRef: PackagingExactArtifactRef;
  completePackRef?: PackagingExactArtifactRef;
  sourceRefs?: PackagingSourceRefs;
};

export type PackagingArtifactData =
  | PackagingDielineData
  | PackagingRoutesData
  | Packaging3dDirectionData
  | PackagingFrontPackData
  | PackagingCompletePackData
  | PackagingViewsData
  | PackagingSkuAdaptationsData;
