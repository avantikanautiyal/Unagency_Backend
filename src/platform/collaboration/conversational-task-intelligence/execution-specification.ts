/**
 * Priority 4.6 — Canonical execution specification (provider-independent).
 * Represents resolved user requirements with provenance for execution handoff.
 */

import type { RequirementSource } from "./conversational-task-contract";
import type { VisualOperationSpec } from "./artifact-reference-input";

export const EXECUTION_RESOLUTION_PLANE_VERSION = "p4.6.0" as const;

/** Provenance for a resolved specification field. */
export type SpecFieldSource =
  | RequirementSource
  | "DEFAULT"
  | "REFERENCE"
  | "SERVICE_CAPABILITY";

export type SpecFieldProvenance = {
  readonly source: SpecFieldSource;
  readonly explicit: boolean;
  readonly enforcement?: RequirementEnforcement;
};

/** P4.8 — How strictly a requirement must be enforced. */
export type RequirementEnforcement =
  | "HARD_CONSTRAINT"
  | "SOFT_PREFERENCE"
  | "INFORMATIONAL"
  | "INFERRED"
  | "DEFAULT";

export type NegativeConstraintSpec = {
  readonly subject: string;
  readonly normalizedConcept: string;
  readonly enforcement: RequirementEnforcement;
};

export type BrandAssetRequirementSpec = {
  readonly assetId?: string;
  readonly role: "logo" | "reference" | "brand_mark";
  readonly required: boolean;
  readonly source?: RequirementSource;
};

/** P4.9.7 — Authoritative logo requirement (generation integrity). */
export type AuthoritativeLogoMode =
  | "USE_EXISTING"
  | "NEEDS_SELECTION"
  | "GENERATE_IF_ABSENT";

export type AuthoritativeLogoSource = "VAULT" | "ATTACHMENT";

export type AuthoritativeLogoCandidate = {
  readonly assetId: string;
  readonly source: AuthoritativeLogoSource;
  readonly name?: string;
  readonly folder?: string;
};

export type AuthoritativeLogoSpec = {
  readonly mode: AuthoritativeLogoMode;
  readonly assetId?: string;
  readonly source?: AuthoritativeLogoSource;
  readonly authoritative: boolean;
  readonly candidates?: readonly AuthoritativeLogoCandidate[];
};

export type ResolvedField<T> = {
  readonly value: T;
  readonly provenance: SpecFieldProvenance;
};

export type OutputIntentMode =
  | "FINAL"
  | "EXPLORATORY"
  | "ALTERNATIVES"
  | "REFINEMENT";

/** Canonical deliverable format identifiers (provider-independent). */
export type DeliverableFormat =
  | "PDF"
  | "PPTX"
  | "DOCX"
  | "HTML"
  | "ZIP"
  | "PNG"
  | "JPG"
  | "TXT"
  | "EDITABLE_TEXT"
  | "MP4";

export type ResolvedDeliverable = {
  readonly format: DeliverableFormat;
  readonly required: boolean;
  readonly editable: boolean;
  readonly provenance: SpecFieldProvenance;
};

/** Generic content item (name, tagline, headline, etc.). */
export type ContentItemSpec = {
  readonly role: string;
  readonly quantity: number;
  readonly wordCount?: number;
  readonly sentenceCount?: number;
  readonly exactness?: "exact" | "approximate";
};

export type ExecutionSpecResolutionState =
  | "RESOLVED"
  | "CLARIFICATION_REQUIRED"
  | "UNSUPPORTED_DELIVERABLE";

export type CanonicalExecutionSpecification = {
  readonly planeVersion: typeof EXECUTION_RESOLUTION_PLANE_VERSION;
  readonly task: {
    readonly action?: ResolvedField<string>;
    readonly objective?: ResolvedField<string>;
    readonly service?: ResolvedField<string>;
    readonly subtype?: ResolvedField<string>;
    readonly industry?: ResolvedField<string>;
    readonly audience?: ResolvedField<string>;
    readonly brand?: ResolvedField<string>;
    readonly product?: ResolvedField<string>;
  };
  readonly content: {
    readonly quantity?: ResolvedField<number>;
    readonly exactness?: ResolvedField<"exact" | "approximate">;
    readonly wordCount?: ResolvedField<number>;
    readonly sentenceCount?: ResolvedField<number>;
    readonly structure?: ResolvedField<readonly string[]>;
    readonly ctaRequired?: ResolvedField<boolean>;
    readonly contentItems?: readonly ResolvedField<ContentItemSpec>[];
  };
  readonly creative: {
    readonly tone?: ResolvedField<string>;
    readonly style?: ResolvedField<string>;
    readonly visualDirection?: ResolvedField<string>;
    readonly positiveConstraints?: readonly ResolvedField<string>[];
    readonly negativeConstraints?: readonly ResolvedField<NegativeConstraintSpec>[];
  };
  readonly brandAssets?: {
    readonly requirements?: readonly ResolvedField<BrandAssetRequirementSpec>[];
  };
  /** P4.9.7 — Canonical authoritative logo resolution state. */
  readonly referenceAssets?: {
    readonly logo?: ResolvedField<AuthoritativeLogoSpec>;
  };
  readonly technical: {
    readonly width?: ResolvedField<number>;
    readonly height?: ResolvedField<number>;
    readonly aspectRatio?: ResolvedField<string>;
    readonly resolution?: ResolvedField<string>;
    readonly pageCount?: ResolvedField<number>;
    readonly orientation?: ResolvedField<string>;
    readonly platform?: ResolvedField<string>;
  };
  readonly deliverables: readonly ResolvedDeliverable[];
  readonly outputIntent: {
    readonly mode: ResolvedField<OutputIntentMode>;
    readonly alternativesRequested?: ResolvedField<boolean>;
    readonly rationaleRequired?: ResolvedField<boolean>;
    readonly rationaleSentenceCount?: ResolvedField<number>;
  };
  readonly resolutionState: ExecutionSpecResolutionState;
  readonly clarificationQuestion?: string;
  readonly unsupportedDeliverables?: readonly DeliverableFormat[];
  /** P4.9 — artifact-grounded visual operation target and reference input. */
  readonly operation?: VisualOperationSpec;
  /** Deterministic execution instruction derived from resolved spec. */
  readonly executionInstruction: string;
};

export function field<T>(
  value: T,
  source: SpecFieldSource,
  explicit: boolean,
): ResolvedField<T> {
  return Object.freeze({ value, provenance: Object.freeze({ source, explicit }) });
}

export function explicitField<T>(value: T, source: SpecFieldSource = "EXPLICIT_USER"): ResolvedField<T> {
  return field(value, source, true);
}

export function defaultField<T>(value: T, source: SpecFieldSource = "DEFAULT"): ResolvedField<T> {
  return field(value, source, false);
}
