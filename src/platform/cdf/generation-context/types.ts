/**
 * Phase 2 — minimal application-level CanonicalGenerationRequest.
 * Not the future provider-neutral multimodal AI Core request.
 */

import type { ConversationWorkingMemory } from "../../ai/conversation-working-memory";
import type { MultimodalContext } from "../../ai/multimodal-context";
import type { GenerationReferenceResolutionResult } from "../../ai/reference-resolution";
import type {
  CdfContextRequirementRef,
  CdfContextSelectionRef,
  CdfContextDecisionRef,
  CdfPhaseContractSlice,
  ResolvedGenerationContext,
} from "../context-resolver/types";

/** Why the current phase receives this artifact. */
export type UpstreamArtifactRole =
  | "source_content"
  | "required_dependency"
  | "approved_content"
  | "selected_reference"
  | "design_reference"
  | "data_source"
  | "visual_reference";

export type UpstreamArtifactContext = {
  artifactId: string;
  version: number;
  artifactKey: string;
  phaseId: string;
  role: UpstreamArtifactRole;
  status: string;
  schemaVersion: string;
  /** Structured artifact payload (exact version). */
  data: Record<string, unknown>;
  lineage: {
    parentArtifactId?: string;
    parentVersion?: number;
    sourceArtifacts: Array<{
      artifactId: string;
      version: number;
      artifactKey: string;
      relationship: string;
    }>;
  };
  /** Session lifecycle role that produced this pin. */
  sessionRole: "approved" | "selected" | "generated";
  /** Dependency was declared required by phase contract. */
  required: boolean;
  /**
   * Provider-generation projection policy (provenance always keeps exact X@V).
   * Defaults applied from dependency contract in resolve-dependencies.
   */
  artifactProjectionMode?: "full" | "selected_only";
};

export type CanonicalGenerationConstraint = {
  key: string;
  displayValue: string;
  priority?: string;
  source: "requirement" | "exclusion" | "decision" | "selection";
};

export type CanonicalGenerationOutputContract = {
  serviceId: string;
  phaseId: string;
  generationModality: string;
  artifactKey: string;
  /** When true, skip PresentationRouteConcepts → Routes expansion. */
  canonicalFullDeck: boolean;
  instructions: string[];
  /** Declared phase execution strategy (never inferred from modality alone). */
  executionStrategy?: string;
};

/** Authorized brand facts already bound on execution (packet / masters). */
export type CanonicalBrandContext = {
  brandId: string;
  /** Selected brand's authoritative display name when known. */
  brandName?: string;
  provenanceLine?: string;
  facts: Array<{ key: string; value: string; tier?: string; provenance?: string }>;
  negatives: Array<{ text: string; source?: string }>;
  /** Fact keys only — for provider-boundary diagnostics. */
  factKeys: readonly string[];
  /** Provenance per projected fact — diagnostics only. */
  factProvenance?: readonly Array<{ key: string; provenance: string }>;
};

/** Service deliverable grounding from authorized metadata (not UI labels). */
export type CanonicalProductGrounding = {
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  category?: string;
};

export type CanonicalGenerationRequest = {
  currentUserInstruction: string;
  requirements: CdfContextRequirementRef[];
  constraints: CanonicalGenerationConstraint[];
  exclusions: CdfContextRequirementRef[];
  selections: CdfContextSelectionRef[];
  /**
   * Exact structured choice objects resolved from parent ArtifactVersion + index.
   * Authority for selected creative direction — not UI labels / "Option N".
   */
  selectedSemanticChoices?: import("./resolve-selected-choice").SelectedSemanticChoice[];
  /**
   * User-authorized generation continuation from a prior visual phase.
   * Observational reference — never a canonical ArtifactVersion pin by itself.
   */
  userSelectedGenerationReference?: {
    selectionKind: "generation_continuation";
    sourcePhaseId: string;
    sourceArtifactKey?: string;
    executionId: string;
    visualArtifactId: string;
    visualArtifactVersion?: number;
    isDiagnosticRaw: boolean;
    generationFanoutGroupId?: string;
    generationFanoutTargetId?: string;
    providerId?: string;
    modelId?: string;
    presentationEligibilityStatus?: string;
    upstreamArtifactId?: string;
    upstreamArtifactVersion?: number;
    upstreamChoiceId?: string;
    upstreamRouteIndex?: number;
  };
  approvedDecisions: CdfContextDecisionRef[];
  /** Selected brand packet projected for generation (when authorized). */
  brandContext?: CanonicalBrandContext;
  /** Service/subtype/platform/format from authorized execution metadata. */
  productGrounding?: CanonicalProductGrounding;
  cdfContext: {
    contextId: string;
    contextHash: string;
    sessionId: string;
    serviceId: string;
    phaseId: string;
    sessionVersion: number;
    activeBriefId?: string;
    activeBriefVersion?: number;
    contextSource: string;
    status: string;
    phaseContext: CdfPhaseContractSlice;
  };
  upstreamArtifacts: UpstreamArtifactContext[];
  outputContract: CanonicalGenerationOutputContract;
  /**
   * Phase 6 — deterministic reference resolution (original instruction preserved).
   * Absent when no reference spans were detected.
   */
  referenceResolution?: GenerationReferenceResolutionResult;
  /**
   * Phase 7 — bounded conversational working memory (contextual evidence only).
   */
  workingMemory?: ConversationWorkingMemory;
  /**
   * CTI effective instruction when present — advisory interpretation only.
   * Must never replace currentUserInstruction.
   */
  conversationalInterpretation?: {
    text: string;
    role: "advisory_cti_interpretation";
  };
  /**
   * Phase 9 — provider-neutral multimodal context (attachments / ProductAssets).
   * Distinct from upstream ArtifactVersions.
   */
  multimodalContext?: MultimodalContext;
  /** Deterministic hash over instruction + requirements + exact upstream pins + data fingerprints. */
  generationContextHash: string;
  /** Provenance from resolver (IDs only). */
  resolvedContext: ResolvedGenerationContext;
};

export type GenerationContextErrorCode =
  | "CONTEXT_RESOLUTION_FAILED"
  | "DEPENDENCY_NOT_SATISFIED"
  | "DEPENDENCY_CONTRACT_INVALID"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_NOT_FOUND"
  | "CANONICAL_CONTEXT_INVALID"
  | "CDF_SELECTION_REFERENCE_UNRESOLVED"
  | "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED"
  | "CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE"
  | "CDF_DELIVERABLE_COMPOSITION_MISSING"
  | "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT"
  | "UPSTREAM_SEMANTIC_PROJECTION_UNRESOLVED"
  | "COMPOSITION_ON_ASSET_RENDERED_COMMUNICATION_UNDECLARED";

export type ApplyCanonicalGenerationContextInput = {
  prompt: string;
  metadata: Record<string, unknown>;
  organizationId?: string;
  projectId?: string;
  /** Optional conversational instruction from CTI (must not replace CDF body). */
  conversationalInstruction?: string;
  /**
   * Already-loaded Collaboration OS / Service AI messages for working memory.
   * Compiler does not query the conversation database.
   */
  conversationMessages?: import("../../ai/conversation-working-memory").WorkingMemorySourceMessage[];
};

export type ApplyCanonicalGenerationContextSuccess = {
  ok: true;
  request: CanonicalGenerationRequest;
  prompt: string;
  metadata: Record<string, unknown>;
};

export type ApplyCanonicalGenerationContextFailure = {
  ok: false;
  code: GenerationContextErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApplyCanonicalGenerationContextResult =
  | ApplyCanonicalGenerationContextSuccess
  | ApplyCanonicalGenerationContextFailure;
