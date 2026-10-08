/**
 * M3C — Generation → Canonical Artifact boundary types.
 * Candidate ≠ Artifact. Execution ≠ Artifact.
 */

import type { CdfArtifactType } from "../canonical";
import type { CdfArtifactReference } from "../artifacts/types";
import type { PresentationArtifactKey } from "../artifacts/presentation/keys";

export type CdfGenerationArtifactErrorCode =
  | "GENERATION_OUTPUT_MISSING"
  | "GENERATION_OUTPUT_MALFORMED"
  | "ARTIFACT_TARGET_UNRESOLVED"
  | "ARTIFACT_NORMALIZATION_FAILED"
  | "ARTIFACT_SCHEMA_INVALID"
  | "ARTIFACT_ASSET_REFERENCE_INVALID"
  | "GENERATION_CONTEXT_MISSING"
  | "GENERATION_CONTEXT_STALE"
  | "EXACT_ARTIFACT_VERSION_REQUIRED"
  | "ARTIFACT_PERSIST_FAILED"
  | "GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT"
  | "ARTIFACT_VALIDATION_FAILED"
  | "ARTIFACT_DEPENDENCY_MISSING"
  /** Provider output cannot become canonical Packaging structure (M8B). */
  | "PACKAGING_CANONICALIZATION_UNSUPPORTED"
  /** Provider output cannot become canonical Social Media structure (M9B). */
  | "SOCIAL_CANONICALIZATION_UNSUPPORTED"
  | "SOCIAL_PROVIDER_OUTPUT_INVALID"
  | "SOCIAL_STRUCTURED_DATA_MISSING"
  | "SOCIAL_VAULT_ASSET_MISSING"
  | "SOCIAL_UPSTREAM_ARTIFACT_MISSING"
  | "SOCIAL_UPSTREAM_VERSION_MISSING";

/** Pre-artifact generation candidate (not persisted as M3A artifact). */
export type GeneratedCandidate = {
  candidateId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  serviceId: string;
  phaseId: string;
  artifactKey: PresentationArtifactKey | string;
  artifactType: CdfArtifactType;
  sourceExecutionId?: string;
  cdfSessionId: string;
  cdfContextId?: string;
  cdfContextHash?: string;
  activeBriefId?: string;
  activeBriefVersion?: number;
  sessionVersionAtGeneration?: number;
  rawOutput: unknown;
  normalizedOutput?: Record<string, unknown>;
  schemaVersion: string;
  provenance: {
    sourceInputIds?: string[];
    parentArtifactId?: string;
    parentVersion?: number;
    sourceArtifacts?: CdfArtifactReference[];
    vaultAssetIds?: string[];
  };
  createdAt: string;
};

export type ArtifactTargetResolution = {
  serviceId: string;
  phaseId: string;
  /** Presentation or Packaging (M8A) canonical artifact key. */
  artifactKey: PresentationArtifactKey | string;
  artifactType: CdfArtifactType;
  schemaVersion: string;
  schemaId: string;
};

export type IngestGenerationInput = {
  sessionId: string;
  serviceId: string;
  phaseId: string;
  projectId?: string;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  /** Required for idempotency when available. */
  executionId?: string;
  /** Explicit override; otherwise derived from phase contract. */
  artifactKey?: string;
  rawOutput: unknown;
  /** Exact context at generation start — used for stale checks. */
  contextId?: string;
  contextHash?: string;
  activeBriefId?: string;
  activeBriefVersion?: number;
  /** Session version expected at generation start. */
  expectedSessionVersion?: number;
  /** When set, create a new version of this artifact. */
  parentArtifactId?: string;
  parentVersion?: number;
  sourceArtifacts?: CdfArtifactReference[];
  sourceInputIds?: string[];
  /** Vault ObjectIds only — attached where adapters need images. */
  vaultAssetIds?: string[];
  /**
   * Exact design-system artifact for deck normalization.
   * Required for presentation.deck when not already in rawOutput.
   */
  designSystemRef?: { artifactId: string; version: number };
  /**
   * Exact design-route artifact for design-system derivation.
   */
  designRouteRef?: { artifactId: string; version: number };
  /** Override idempotency key (defaults to m3c:exec:key). */
  requestId?: string;
  /** Route index when normalizing one route from PresentationRoutes. */
  routeIndex?: number;
  /**
   * When true (default), run shared M4 acceptCandidatePayload before persist.
   * FAILED → no ArtifactVersion (throws ARTIFACT_VALIDATION_FAILED).
   * Set false only for normalize-only unit tests that intentionally skip M4.
   */
  requireAcceptanceGate?: boolean;
  /** 1-based automatic quality attempt forwarded to the M4 gate. */
  qualityAttempt?: number;
  /** Exact upstream pins stamped onto deck sourceRefs. */
  upstreamArtifactRefs?: Array<{
    artifactId: string;
    version: number;
    artifactKey: string;
  }>;
  /** Packaging exact upstream pins (M8A adapters) — never "latest". */
  packagingRefs?: {
    dielineRef?: { artifactId: string; version: number };
    routesRef?: { artifactId: string; version: number };
    threeDDirectionRef?: { artifactId: string; version: number };
    frontPackRef?: { artifactId: string; version: number };
    completePackRef?: { artifactId: string; version: number };
    viewsRef?: { artifactId: string; version: number };
  };
  /** Social Media exact upstream pins (M9A adapters) — never "latest". */
  socialMediaRefs?: {
    platformRef?: { artifactId: string; version: number };
    sizeReferenceRef?: { artifactId: string; version: number };
    routesRef?: { artifactId: string; version: number };
  };
  /** Optional override requirements for the pre-persist M4 gate. */
  requirements?: import("../requirements/types").CdfRequirement[];
};

export type IngestGenerationResult = {
  candidate: GeneratedCandidate;
  artifactId: string;
  artifactVersion: number;
  artifactKey: string;
  schemaId: string;
  idempotentReplay?: boolean;
  /** M4 status after pre-persist acceptance (passed | review_required). */
  validationStatus?: string;
  validationId?: string;
};
