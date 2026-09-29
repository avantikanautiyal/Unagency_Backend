/**
 * CDF 2.0 M2 — Requirement Fidelity Engine types.
 * Distinct from CS `requestProject` and conversational-task-intelligence requirements.
 */

export const CDF_REQUIREMENT_PRIORITIES = [
  "explicit_current_user_instruction",
  "explicit_user_override",
  "approved_user_decision",
  "earlier_explicit_user_requirement",
  "user_provided_source_reference",
  "cdf_service_rule",
  "system_default",
  "ai_inference",
] as const;

export type CdfRequirementPriority = (typeof CDF_REQUIREMENT_PRIORITIES)[number];

/** Lower rank = higher authority. */
export const CDF_REQUIREMENT_PRIORITY_RANK: Record<CdfRequirementPriority, number> =
  {
    explicit_current_user_instruction: 1,
    explicit_user_override: 2,
    approved_user_decision: 3,
    earlier_explicit_user_requirement: 4,
    user_provided_source_reference: 5,
    cdf_service_rule: 6,
    system_default: 7,
    ai_inference: 8,
  };

export type CdfSourceInputType =
  | "user_prompt"
  | "user_message"
  | "uploaded_file"
  | "uploaded_image"
  | "reference"
  | "selection"
  | "approval"
  | "refinement"
  | "system_context"
  /** Legacy select_route dual-wrote approval — not a canonical user approval. */
  | "legacy_select_compat";

export type CdfRequirementCategory =
  | "content"
  | "quantity"
  | "dimension"
  | "format"
  | "platform"
  | "audience"
  | "brand"
  | "tone"
  | "style"
  | "visual"
  | "color"
  | "typography"
  | "layout"
  | "structure"
  | "mandatory_content"
  | "forbidden_content"
  | "reference"
  | "asset"
  | "technical"
  | "delivery"
  | "constraint"
  | "preference";

export type CdfRequirementStatus =
  | "active"
  | "superseded"
  | "conflicted"
  | "ambiguous"
  | "satisfied"
  | "unsatisfied"
  | "rejected";

export type CdfExtractionMethod =
  | "explicit"
  | "structured_input"
  | "user_selection"
  | "user_override"
  | "approved_decision"
  | "source_document"
  | "ai_inferred"
  | "system_rule"
  | "legacy_compat";

export type CdfRequirementValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "enum"; value: string; enumName?: string }
  | { kind: "string[]"; value: string[] }
  | { kind: "number[]"; value: number[] }
  | {
      kind: "dimension";
      value: { width: number; height: number; unit: "px" | "in" | "mm" | "pt" };
    }
  | { kind: "color"; value: string }
  | { kind: "range"; value: { min: number; max: number } }
  | { kind: "object"; value: Record<string, unknown> };

export type CdfSourceInput = {
  sourceInputId: string;
  projectId?: string;
  sessionId: string;
  serviceId: string;
  type: CdfSourceInputType;
  /** Immutable raw user/system text — never replaced by summaries. */
  rawContent: string;
  metadata?: Record<string, unknown>;
  /** Origin label e.g. chat, product_picker, upload. */
  source?: string;
  createdAt: string;
  createdBy?: string;
  sequence: number;
  parentSourceInputId?: string;
  checksum?: string;
};

export type CdfRequirementProvenance = {
  sourceInputId: string;
  sourceType: CdfSourceInputType;
  extractionMethod: CdfExtractionMethod;
  explicit: boolean;
  confidence: number;
};

export type CdfRequirement = {
  requirementId: string;
  projectId?: string;
  sessionId: string;
  serviceId: string;
  key: string;
  value: CdfRequirementValue;
  /** Human-readable display of value for prompts/audit. */
  displayValue: string;
  category: CdfRequirementCategory;
  priority: CdfRequirementPriority;
  provenance: CdfRequirementProvenance;
  status: CdfRequirementStatus;
  confidence: number;
  explicit: boolean;
  overriddenRequirementId?: string;
  supersedesRequirementId?: string;
  conflictGroupId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CdfRequirementOverride = {
  overrideId: string;
  targetRequirementId: string;
  newRequirementId: string;
  sourceInputId: string;
  previousValue: CdfRequirementValue;
  newValue: CdfRequirementValue;
  reason?: string;
  createdAt: string;
};

export type CdfUnresolvedConflict = {
  conflictId: string;
  key: string;
  requirementIds: string[];
  reason: string;
};

export type CdfActiveBrief = {
  activeBriefId: string;
  projectId?: string;
  sessionId: string;
  serviceId: string;
  version: number;
  sourceInputIds: string[];
  requirementIds: string[];
  /** Resolved active view (status=active only). */
  activeRequirements: CdfRequirement[];
  constraints: CdfRequirement[];
  exclusions: CdfRequirement[];
  references: CdfRequirement[];
  decisions: CdfRequirement[];
  overrides: CdfRequirementOverride[];
  unresolvedConflicts: CdfUnresolvedConflict[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Lightweight snapshot for prompt builders / future M2B Context Resolver.
 * Not the Context Resolver itself.
 */
export type CdfRequirementContextSnapshot = {
  activeBriefId: string;
  activeBriefVersion: number;
  sessionId: string;
  serviceId: string;
  /** Full raw prompts (uncut) — critical fidelity. */
  rawSourceTexts: Array<{
    sourceInputId: string;
    type: CdfSourceInputType;
    rawContent: string;
  }>;
  explicitRequirements: Array<{
    requirementId: string;
    key: string;
    displayValue: string;
    category: CdfRequirementCategory;
    priority: CdfRequirementPriority;
  }>;
  constraints: Array<{ key: string; displayValue: string }>;
  exclusions: Array<{ key: string; displayValue: string }>;
  references: Array<{ key: string; displayValue: string }>;
  approvedDecisions: Array<{ key: string; displayValue: string }>;
  selections: Array<{ key: string; displayValue: string }>;
  unresolvedConflicts: CdfUnresolvedConflict[];
  sourceInputRefs: string[];
};

/** Future M1B hardening boundary — do not implement full store in M2. */
export type CdfActionRequestBoundary = {
  /** Domain note: session.lastRequestKey is single-slot today. */
  futureRecordShape: "CdfActionRequest / IdempotencyRecord";
  fields: readonly [
    "requestId",
    "sessionId",
    "expectedVersion",
    "action",
    "fingerprint",
    "resultSessionVersion",
    "createdAt",
  ];
};
