/**
 * Canonical OS Structured Brief — Phase 1.
 * One representation for NL → executable intent. Not a product "CreateBrief" CRUD entity.
 */

export const STRUCTURED_BRIEF_VERSION = "1.0.0" as const;

export type BriefStatus =
  | "VALID"
  | "NEEDS_INFORMATION"
  | "AMBIGUOUS"
  | "UNSUPPORTED"
  | "INVALID";

export type BriefProvenanceSource =
  | "USER"
  | "CLIENT_CAPABILITY"
  | "PRODUCT_METADATA"
  | "BRAND_CONTEXT"
  | "KNOWLEDGE_CONTEXT"
  | "SYSTEM_RULE"
  | "INFERENCE";

export type BriefIntentKind =
  | "campaign"
  | "landing_page"
  | "website"
  | "social_content"
  | "advertisement"
  | "copy"
  | "image"
  | "video"
  | "audio"
  | "research"
  | "document"
  | "analysis"
  | "embedding"
  | "other";

/** Runtime inventory capability IDs Brief may map to (validated). */
export type BriefRuntimeCapabilityId =
  | "text.generate"
  | "text.chat"
  | "reasoning.analyze"
  | "image.generate"
  | "vision.analyze"
  | "video.generate"
  | "audio.synthesize"
  | "audio.transcribe"
  | "embedding.generate";

export const BRIEF_RUNTIME_CAPABILITY_IDS: readonly BriefRuntimeCapabilityId[] =
  Object.freeze([
    "text.generate",
    "text.chat",
    "reasoning.analyze",
    "image.generate",
    "vision.analyze",
    "video.generate",
    "audio.synthesize",
    "audio.transcribe",
    "embedding.generate",
  ]);

export type BriefDeliverableType =
  | "campaign_strategy"
  | "instagram_content"
  | "social_post"
  | "meta_ad_copy"
  | "ad_creative"
  | "landing_page"
  | "website"
  | "caption"
  | "copy"
  | "image"
  | "video"
  | "audio"
  | "research_report"
  | "document"
  | "analysis"
  | "embedding"
  | "other";

export interface BriefProvenanceEntry {
  readonly field: string;
  readonly value: string;
  readonly source: BriefProvenanceSource;
  readonly confidence?: number;
}

export interface BriefAssumption {
  readonly statement: string;
  readonly source: BriefProvenanceSource;
  readonly confidence: number;
}

export interface BriefMissingInformation {
  readonly key: string;
  readonly reason: string;
  readonly severity: "required" | "recommended";
}

export interface BriefDeliverable {
  readonly id: string;
  readonly type: BriefDeliverableType;
  readonly description: string;
  readonly required: boolean;
  readonly quantity?: number;
  readonly channel?: string;
  readonly dependencies?: readonly string[];
  readonly expectedOutputType?: string;
  readonly provenance: BriefProvenanceSource;
}

export interface BriefRequirement {
  readonly key: string;
  readonly value: string;
  readonly provenance: BriefProvenanceSource;
  readonly confidence: number;
}

export interface BriefConstraint {
  readonly key: string;
  readonly value: string;
  readonly provenance: BriefProvenanceSource;
  /** USER = explicitly stated; INFERENCE/SYSTEM_RULE = inferred */
  readonly explicit: boolean;
}

export interface BriefCapabilityRequirement {
  readonly capabilityId: BriefRuntimeCapabilityId;
  readonly role: "primary" | "supporting";
  readonly rationale: string;
}

export interface BriefConfidence {
  /** Aggregate system confidence after validation (0–1). */
  readonly system: number;
  /** Optional heuristic model-like signal; not ground truth. */
  readonly extraction: number;
}

export interface StructuredBrief {
  readonly id: string;
  readonly version: typeof STRUCTURED_BRIEF_VERSION;
  readonly executionId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly requestId: string;
  readonly sourceRequest: {
    readonly promptPreview: string;
    readonly clientCapabilityId?: string;
  };
  readonly intent: {
    readonly kind: BriefIntentKind;
    readonly confidence: number;
  };
  readonly objective: string;
  readonly deliverables: readonly BriefDeliverable[];
  readonly audience?: string;
  readonly channels: readonly string[];
  readonly constraints: readonly BriefConstraint[];
  readonly requirements: readonly BriefRequirement[];
  readonly preferences: readonly BriefRequirement[];
  readonly requiredCapabilities: readonly BriefCapabilityRequirement[];
  readonly outputRequirements: readonly string[];
  readonly dependencies: readonly string[];
  readonly priority: "low" | "normal" | "high";
  readonly missingInformation: readonly BriefMissingInformation[];
  readonly assumptions: readonly BriefAssumption[];
  readonly confidence: BriefConfidence;
  readonly status: BriefStatus;
  readonly provenance: readonly BriefProvenanceEntry[];
  readonly createdAt: string;
}

export interface BriefAvailableContext {
  readonly brandId?: string;
  readonly brandName?: string;
  readonly styleInstructions?: string;
  readonly productService?: string;
  readonly productCategory?: string;
  readonly productPath?: string;
  readonly deliverableLabel?: string;
  readonly platform?: string;
  readonly format?: string;
}

export interface CreateStructuredBriefInput {
  readonly tenant: {
    readonly organizationId: string;
    readonly userId?: string;
    readonly requestId: string;
    readonly executionId: string;
    readonly workspaceId?: string;
    readonly correlationId?: string;
  };
  readonly rawPrompt: string;
  readonly clientCapabilityId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly availableContext?: BriefAvailableContext;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}
