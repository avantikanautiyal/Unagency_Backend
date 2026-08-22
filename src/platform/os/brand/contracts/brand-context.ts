/**
 * Canonical OS Brand Context — Phase 2.
 * Structured brand understanding for generation (not BrandGuard / post-gen validation).
 */

export const BRAND_CONTEXT_VERSION = "1.0.0" as const;

export type BrandContextStatus =
  | "READY"
  | "PARTIAL"
  | "EMPTY"
  | "MISSING"
  | "INVALID";

export type BrandProvenanceSource =
  | "BRAND_PROFILE"
  | "BRAND_GUIDELINES"
  | "USER_INPUT"
  | "APPROVED_OUTPUT"
  | "BRAND_ASSET"
  | "SYSTEM_RULE";

export type BrandFieldCompleteness = "complete" | "partial" | "missing";

export interface BrandProvenanceEntry {
  readonly field: string;
  readonly value: string;
  readonly source: BrandProvenanceSource;
}

export interface BrandMissingInformation {
  readonly key: string;
  readonly reason: string;
  readonly severity: "required" | "recommended";
}

export interface BrandIdentitySection {
  readonly name?: string;
  readonly mission?: string;
  readonly vision?: string;
  readonly industry?: string;
  readonly website?: string;
}

export interface BrandPositioningSection {
  readonly statement?: string;
  readonly differentiators?: readonly string[];
}

export interface BrandAudienceSection {
  readonly primary?: string;
  readonly framing?: string;
}

export interface BrandVoiceSection {
  readonly voice?: string;
  readonly personality?: string;
  readonly writingStyle?: string;
}

export interface BrandToneSection {
  readonly tone?: string;
  readonly adjectives?: readonly string[];
}

export interface BrandVocabularySection {
  readonly preferred?: readonly string[];
  readonly avoid?: readonly string[];
}

export interface BrandMessagingSection {
  readonly guidelines?: string;
  readonly ctaStyle?: string;
  readonly formattingRules?: string;
  readonly emojiPolicy?: string;
}

export interface BrandVisualIdentitySection {
  readonly colors?: readonly string[];
  readonly primaryColors?: readonly string[];
  readonly secondaryColors?: readonly string[];
  readonly typography?: string;
  readonly logoRules?: string;
  readonly photographyStyle?: string;
  readonly illustrationStyle?: string;
  readonly iconStyle?: string;
  readonly socialStyle?: string;
  readonly spacingRules?: string;
}

export interface BrandCreativePrinciplesSection {
  readonly aiRules?: string;
  readonly localizationRules?: string;
}

export interface BrandCommunicationRulesSection {
  readonly approvalRules?: string;
  readonly legalNotes?: string;
  readonly complianceNotes?: string;
}

export interface BrandAssetReference {
  readonly assetId: string;
  readonly type: "logo" | "media" | "other";
  readonly purpose?: string;
  readonly name?: string;
}

export interface BrandCompletenessMap {
  readonly identity: BrandFieldCompleteness;
  readonly positioning: BrandFieldCompleteness;
  readonly voice: BrandFieldCompleteness;
  readonly tone: BrandFieldCompleteness;
  readonly messaging: BrandFieldCompleteness;
  readonly visualIdentity: BrandFieldCompleteness;
  readonly overall: "COMPLETE" | "PARTIAL" | "EMPTY";
}

export interface BrandContext {
  readonly id: string;
  readonly version: typeof BRAND_CONTEXT_VERSION;
  readonly brandId?: string;
  readonly organizationId: string;
  readonly brandVersion: string;
  readonly executionId: string;
  readonly status: BrandContextStatus;
  readonly identity: BrandIdentitySection;
  readonly positioning: BrandPositioningSection;
  readonly audience: BrandAudienceSection;
  readonly voice: BrandVoiceSection;
  readonly tone: BrandToneSection;
  readonly vocabulary: BrandVocabularySection;
  readonly messaging: BrandMessagingSection;
  readonly visualIdentity: BrandVisualIdentitySection;
  readonly creativePrinciples: BrandCreativePrinciplesSection;
  readonly communicationRules: BrandCommunicationRulesSection;
  readonly prohibitedPatterns: readonly string[];
  readonly preferredPatterns: readonly string[];
  readonly ctaRules?: string;
  readonly assetReferences: readonly BrandAssetReference[];
  readonly completeness: BrandCompletenessMap;
  readonly missingInformation: readonly BrandMissingInformation[];
  readonly confidence: {
    readonly system: number;
  };
  readonly provenance: readonly BrandProvenanceEntry[];
  readonly sourceReferences: readonly string[];
  readonly contextGeneratedAt: string;
  /** Stable fingerprint for audit without duplicating full context. */
  readonly contextHash: string;
}

/** Product brand record consumed by Brand Intelligence (tenant-scoped). */
export interface BrandRecord {
  readonly brandId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly voice?: string;
  readonly positioning?: string;
  readonly guidelines?: string;
  readonly industry?: string;
  readonly targetAudience?: string;
  readonly website?: string;
  readonly colors?: readonly string[];
  readonly logoAssetId?: string;
  readonly guidelinesProfile?: Readonly<Record<string, unknown>>;
}

export type BrandTaskKind =
  | "copy"
  | "social_content"
  | "campaign"
  | "image"
  | "video"
  | "website"
  | "landing_page"
  | "audio"
  | "other";

export interface GetBrandContextInput {
  readonly organizationId: string;
  readonly brandId?: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly userId?: string;
  readonly taskKind?: BrandTaskKind;
  readonly capabilityId?: string;
  readonly briefIntent?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export function emptyBrandContext(input: {
  readonly organizationId: string;
  readonly executionId: string;
  readonly status: "EMPTY" | "MISSING";
  readonly brandId?: string;
  readonly reason?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}): BrandContext {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const generatedAt = nowIso();
  return {
    id: createId("bctx"),
    version: BRAND_CONTEXT_VERSION,
    brandId: input.brandId,
    organizationId: input.organizationId,
    brandVersion: "0",
    executionId: input.executionId,
    status: input.status,
    identity: {},
    positioning: {},
    audience: {},
    voice: {},
    tone: {},
    vocabulary: {},
    messaging: {},
    visualIdentity: {},
    creativePrinciples: {},
    communicationRules: {},
    prohibitedPatterns: [],
    preferredPatterns: [],
    assetReferences: [],
    completeness: {
      identity: "missing",
      positioning: "missing",
      voice: "missing",
      tone: "missing",
      messaging: "missing",
      visualIdentity: "missing",
      overall: "EMPTY",
    },
    missingInformation: input.reason
      ? [
          {
            key: "brand",
            reason: input.reason,
            severity: "recommended",
          },
        ]
      : [],
    confidence: { system: 0 },
    provenance: [
      {
        field: "status",
        value: input.status,
        source: "SYSTEM_RULE",
      },
    ],
    sourceReferences: [],
    contextGeneratedAt: generatedAt,
    contextHash: `empty:${input.organizationId}:${input.status}`,
  };
}
