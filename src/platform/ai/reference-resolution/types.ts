/**
 * Generation-path reference resolution (Phase 6).
 * Deterministic only — never invents targets. Distinct from CTI chat-turn
 * route/asset resolution (conversational-task-intelligence/reference-resolution).
 */

export type GenerationReferenceResolutionStatus =
  | "exact"
  | "deterministic"
  | "ambiguous"
  | "unresolved";

export type GenerationReferenceType =
  | "artifact"
  | "artifact_version"
  | "cdf_phase"
  | "slide"
  | "option"
  | "selected_output"
  | "approved_output"
  | "current_output"
  | "previous_output"
  | "design_system"
  | "design_route"
  | "deictic";

export type GenerationReferenceTargetType =
  | "artifact_version"
  | "slide"
  | "option"
  | "design_system"
  | "design_route"
  | "cdf_phase_output"
  | "unknown";

export type GenerationResolutionMethod =
  | "explicit_slide_index"
  | "ordinal_slide"
  | "explicit_option_index"
  | "ordinal_option"
  | "explicit_artifact_version"
  | "approved_artifact"
  | "selected_artifact"
  | "generated_artifact"
  | "previous_phase_output"
  | "current_phase_target"
  | "design_reference"
  | "existing_cti_target"
  | "artifact_lineage"
  | "unresolved";

export type GenerationReferenceCandidate = {
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey?: string;
  readonly phaseId?: string;
  readonly sessionRole?: "approved" | "selected" | "generated";
  readonly role?: string;
  /** Structured slide count when known from upstream data. */
  readonly slideCount?: number;
  readonly slideIds?: readonly string[];
};

export type ResolvedGenerationReference = {
  readonly sourceText: string;
  readonly referenceType: GenerationReferenceType;
  readonly targetType: GenerationReferenceTargetType;
  readonly status: GenerationReferenceResolutionStatus;
  readonly resolutionMethod: GenerationResolutionMethod;
  readonly provenance: readonly string[];
  readonly targetId?: string;
  readonly artifactId?: string;
  readonly version?: number;
  readonly artifactKey?: string;
  readonly phaseId?: string;
  readonly slideNumber?: number;
  readonly slideId?: string;
  /** 1-based option/route index when instruction names "option N" / "Nth option". */
  readonly optionIndex?: number;
  /** Present when status=ambiguous — IDs only, no payloads. */
  readonly candidateSummaries?: readonly string[];
  readonly reason?: string;
};

export type GenerationReferenceResolutionResult = {
  /** Always the original user wording — never rewritten. */
  readonly originalUserInstruction: string;
  readonly references: readonly ResolvedGenerationReference[];
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly ambiguousCount: number;
  readonly applied: boolean;
};

export type ResolveGenerationReferencesInput = {
  readonly instruction: string;
  readonly phaseId?: string;
  readonly serviceId?: string;
  /** Already-authorized session pins / upstream (exact versions). */
  readonly candidates: readonly GenerationReferenceCandidate[];
  /** Optional UI/session selected slide (1-based). Explicit slide in text wins. */
  readonly selectedSlideNumber?: number;
  /** Optional CTI-resolved artifact hint (must also appear in candidates). */
  readonly ctiArtifactId?: string;
  readonly ctiArtifactVersion?: number;
};
