/**
 * CDF 2.0 M6 — Targeted refinement types.
 *
 * Refinement is patch-based against an exact ArtifactVersion.
 * Never mutates existing versions. Never regenerates a full deck.
 */

export const CDF_REFINEMENT_ENGINE_VERSION = "m6.presentation.v1";
/** Packaging strategy within the shared M6 refinement engine (M8D). */
export const CDF_PACKAGING_REFINEMENT_ENGINE_VERSION = "m6.packaging.v1";
/** Social Media strategy within the shared M6 refinement engine (M9D). */
export const CDF_SOCIAL_MEDIA_REFINEMENT_ENGINE_VERSION = "m6.social_media.v1";

export type CdfRefinementStatus =
  | "pending"
  | "target_resolved"
  | "requires_clarification"
  | "patch_generated"
  | "patch_validated"
  | "applied"
  | "validation_failed"
  | "rejected"
  | "superseded";

export type CdfRefinementScope =
  | "artifact"
  | "slide"
  | "element"
  | "group"
  | "property"
  | "panel"
  | "route"
  | "direction"
  | "surface"
  | "view"
  | "sku"
  | "asset";

export type CdfResolvedRefinementTarget = {
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  slideId?: string;
  elementId?: string;
  /** Packaging stable entity id (panel/route/direction/surface/view/sku). */
  entityId?: string;
  entityKind?:
    | "artifact"
    | "panel"
    | "route"
    | "direction"
    | "surface"
    | "view"
    | "sku"
    | "asset"
    | "platform"
    | "size"
    | "creative";
  fieldPath?: string;
  /** Human-readable path e.g. slide_07.element_title_01 or route_01.name */
  path: string;
  targetKind:
    | "artifact"
    | "slide"
    | "text_element"
    | "image_element"
    | "shape_element"
    | "group"
    | "table"
    | "design_system"
    | "property";
};

export type CdfPatchOp =
  | "SET_TEXT"
  | "SET_FONT_SIZE"
  | "SET_FONT_FAMILY"
  | "SET_FONT_WEIGHT"
  | "SET_TEXT_COLOR"
  | "SET_BACKGROUND"
  | "SET_POSITION"
  | "SET_SIZE"
  | "SET_OPACITY"
  | "REPLACE_ASSET"
  | "SET_VISIBILITY"
  | "SET_ALIGNMENT"
  | "SET_LINE_HEIGHT"
  | "SET_LETTER_SPACING"
  | "SET_BORDER"
  | "SET_FILL"
  | "SET_ROTATION";

export type CdfPatchTarget = {
  slideId?: string;
  elementId?: string;
  entityId?: string;
  entityKind?:
    | "artifact"
    | "panel"
    | "route"
    | "direction"
    | "surface"
    | "view"
    | "sku"
    | "asset"
    | "platform"
    | "size"
    | "creative";
  fieldPath?: string;
};

export type CdfPatchOperation = {
  op: CdfPatchOp;
  target: CdfPatchTarget;
  value: unknown;
  /** Property path for isolation evidence */
  property?: string;
};

export type CdfRefinementPatch = {
  operations: CdfPatchOperation[];
  scope: CdfRefinementScope;
};

export type CdfRefinementChange = {
  property: string;
  path: string;
  from: unknown;
  to: unknown;
};

export type CdfRefinementRequest = {
  refinementId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  sessionId: string;
  serviceId: string;
  phaseId: string;
  sourceInputId?: string;
  rawInstruction: string;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  contextId?: string;
  contextHash?: string;
  briefVersion?: number;
  sessionVersion?: number;
  resolvedTarget?: CdfResolvedRefinementTarget;
  scope?: CdfRefinementScope;
  constraints?: Record<string, unknown>;
  patch?: CdfRefinementPatch;
  status: CdfRefinementStatus;
  clarificationReason?: string;
  clarificationCandidates?: string[];
  changes?: CdfRefinementChange[];
  newArtifactVersion?: number;
  validationStatus?: string;
  validationId?: string;
  createdAt: string;
  updatedAt: string;
  requestId?: string;
  engineVersion: string;
};

export type ApplyRefinementInput = {
  sessionId: string;
  serviceId: string;
  phaseId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  rawInstruction: string;
  artifactId: string;
  artifactVersion: number;
  artifactKey?: string;
  contextId?: string;
  contextHash?: string;
  briefVersion?: number;
  /** Exact session version used at request time — stale if mismatched. */
  expectedSessionVersion?: number;
  /** CAS: expected latest creative version of the artifact. */
  expectedLatestVersion?: number;
  requestId?: string;
  /** Optional pre-resolved target path to disambiguate. */
  preferredTargetPath?: string;
  /** Skip M4 when false (unit tests of patch mechanics only). Default true. */
  runM4?: boolean;
  /**
   * Optional M4 requirement set override (tests / explicit gate).
   * When omitted, ActiveBrief actives are used.
   */
  m4Requirements?: import("../requirements/types").CdfRequirement[];
  applyLifecycle?: boolean;
};

export type ApplyRefinementResult = {
  status: CdfRefinementStatus;
  refinementId: string;
  artifactId: string;
  sourceVersion: number;
  newVersion?: number;
  target?: CdfResolvedRefinementTarget;
  changes?: CdfRefinementChange[];
  clarificationReason?: string;
  clarificationCandidates?: string[];
  validation?: {
    status: string;
    validationId?: string;
  };
  request?: CdfRefinementRequest;
  idempotentReplay?: boolean;
};

export type CdfRefinementErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_NOT_FOUND"
  | "AMBIGUOUS_TARGET"
  | "TARGET_NOT_FOUND"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_PATCH"
  | "ISOLATION_VIOLATION"
  | "SCHEMA_INVALID"
  | "VALIDATION_FAILED"
  | "STALE_CONTEXT"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "ASSET_NOT_FOUND"
  | "OWNERSHIP_INVALID"
  | "REFINEMENT_FAILED";
