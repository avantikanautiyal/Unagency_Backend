/**
 * CDF 2.0 M4 — Generation validation / requirement fidelity types.
 */

import type { CdfRequirement } from "../requirements/types";

export const CDF_VALIDATOR_VERSION = "m4.cdf.v2";

export type CdfValidationStatus =
  | "passed"
  | "failed"
  | "requires_clarification"
  | "review_required";

export type CdfValidationCheckStatus =
  | "pass"
  | "fail"
  | "warning"
  | "not_applicable"
  | "unable_to_verify"
  | "semantic_review_required";

export type CdfValidationSeverity =
  | "blocking"
  | "warning"
  | "informational";

export type CdfVerificationCapability =
  | "machine_verifiable"
  | "semantic_review_required"
  | "unable_to_verify";

export type CdfVerificationType =
  | "exact_match"
  | "contains"
  | "not_contains"
  | "numeric_exact"
  | "numeric_range"
  | "count"
  | "dimensions"
  | "aspect_ratio"
  | "enum"
  | "reference_match"
  | "structural_presence"
  | "structural_absence"
  | "ordering"
  | "pattern"
  | "semantic_manual_review";

export type CdfValidationCheck = {
  checkId: string;
  requirementId?: string;
  requirementKey?: string;
  category: string;
  verificationType: CdfVerificationType;
  capability: CdfVerificationCapability;
  fieldPath: string;
  expected: unknown;
  actual: unknown;
  status: CdfValidationCheckStatus;
  severity: CdfValidationSeverity;
  evidence: string;
};

export type CdfValidationResult = {
  validationId: string;
  status: CdfValidationStatus;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  contextId?: string;
  contextHash?: string;
  activeBriefId?: string;
  activeBriefVersion?: number;
  sessionId?: string;
  checks: CdfValidationCheck[];
  summary: string;
  blockingIssues: CdfValidationCheck[];
  warnings: CdfValidationCheck[];
  reviewRequired: CdfValidationCheck[];
  validatedAt: string;
  validatorVersion: string;
};

export type ValidateArtifactInput = {
  /**
   * Persisted artifact id. For headless first-create candidate gates,
   * may be a sentinel (`__candidate_gate__`) — getArtifact is skipped
   * when candidateData + artifactKey + sessionId are provided.
   */
  artifactId: string;
  /** Defaults to latest version. */
  artifactVersion?: number;
  /**
   * Optional in-memory candidate payload (M6 / M3C pre-persist gate).
   * When set, validates this data instead of loading a persisted version body.
   * Does not mutate or create ArtifactVersions.
   */
  candidateData?: Record<string, unknown>;
  /** Required when validating a candidate without relying on head.artifactKey. */
  artifactKey?: string;
  /** Active requirements — typically from ActiveBrief. Defaults to session bag actives. */
  requirements?: CdfRequirement[];
  sessionId?: string;
  contextId?: string;
  contextHash?: string;
  activeBriefId?: string;
  activeBriefVersion?: number;
  /** Exact session version used at generation — stale if mismatched. */
  expectedSessionVersion?: number;
  /** Expected dependency pins (exact versions). */
  expectedDesignSystemRef?: { artifactId: string; version: number };
  expectedDesignRouteRef?: { artifactId: string; version: number };
  /** Packaging exact upstream pins (M8C). */
  expectedPackagingRefs?: {
    dielineRef?: { artifactId: string; version: number };
    routesRef?: { artifactId: string; version: number };
    threeDDirectionRef?: { artifactId: string; version: number };
    frontPackRef?: { artifactId: string; version: number };
    completePackRef?: { artifactId: string; version: number };
    viewsRef?: { artifactId: string; version: number };
  };
  organizationId?: string;
  projectId?: string;
  /** When true, markValidated on pass / markRejected on fail (persisted versions only). */
  applyLifecycle?: boolean;
};

/** Observations extracted from canonical artifact data (no mutation). */
export type ArtifactObservation = {
  artifactKey: string;
  slideCount?: number;
  routeCount?: number;
  /** Packaging SKU count when observable. */
  skuCount?: number;
  dimensions?: { widthUnits: number; heightUnits: number; aspectRatio: string };
  aspectRatio?: string;
  titles: string[];
  textCorpus: string;
  sectionIds: string[];
  sectionTitles: string[];
  colors: string[];
  colorKeys: string[];
  vaultAssetIds: string[];
  designSystemRef?: { artifactId: string; version: number; artifactKey?: string };
  derivedFromRoute?: { artifactId: string; version: number };
  hasLogoAsset?: boolean;
  elementTypes: string[];
  exactHeadlines: string[];
  // ─── Packaging (M8C) ─────────────────────────────────────────────────────
  panelIds?: string[];
  surfaceIds?: string[];
  viewIds?: string[];
  skuIds?: string[];
  routeIds?: string[];
  selectedRouteId?: string;
  pathKind?: string;
  packageType?: string;
  physicalDimensionsMm?: {
    widthMm: number;
    heightMm: number;
    depthMm?: number;
  };
  geometryUnresolved?: boolean;
  structuredSceneUnresolved?: boolean;
  packagingRefs?: {
    dieline?: { artifactId: string; version: number; artifactKey?: string };
    routes?: { artifactId: string; version: number; artifactKey?: string };
    threeDDirection?: { artifactId: string; version: number; artifactKey?: string };
    frontPack?: { artifactId: string; version: number; artifactKey?: string };
    completePack?: { artifactId: string; version: number; artifactKey?: string };
    views?: { artifactId: string; version: number; artifactKey?: string };
  };
  hasLatestRef?: boolean;
  hasExecAsAsset?: boolean;
  hasArtAsAsset?: boolean;
  hasCdfartAsVault?: boolean;
  duplicateIds?: string[];
};
