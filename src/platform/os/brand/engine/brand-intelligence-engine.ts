/**
 * Brand Intelligence engine — BrandRecord → validated BrandContext.
 * Provider-agnostic. Never uses sampleBrandBrain.
 */

import {
  BRAND_CONTEXT_VERSION,
  emptyBrandContext,
  type BrandCompletenessMap,
  type BrandContext,
  type BrandFieldCompleteness,
  type BrandMissingInformation,
  type BrandProvenanceEntry,
  type BrandRecord,
  type GetBrandContextInput,
} from "../contracts/brand-context";
import { BrandIntelligenceError } from "../contracts/errors";
import { validateBrandContext } from "../validation/validate-brand-context";
import {
  createProductBrandRecordSource,
  type IBrandRecordSource,
} from "./brand-source";
import {
  resolveBrandTaskKind,
  selectBrandContextForTask,
} from "./task-context-selector";

export interface IBrandIntelligenceEngine {
  readonly implementationStatus: "implemented";
  getContext(input: GetBrandContextInput): Promise<BrandContext>;
}

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function fieldCompleteness(...values: Array<string | readonly string[] | undefined>): BrandFieldCompleteness {
  const present = values.some((v) =>
    typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) && v.length > 0
  );
  return present ? "complete" : "missing";
}

function hashContext(parts: readonly string[]): string {
  // Stable non-crypto fingerprint for audit references (not a security boundary).
  let h = 2166136261;
  const joined = parts.join("|");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `bch_${(h >>> 0).toString(16)}`;
}

function buildFromRecord(
  record: BrandRecord,
  input: GetBrandContextInput
): BrandContext {
  const gp = record.guidelinesProfile ?? {};
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);

  const tone = str(gp.tone) ?? str(record.voice);
  const voice = str(record.voice) ?? str(gp.voiceGuidelines);
  const personality = str(gp.brandPersonality);
  const writingStyle = str(gp.writingStyle);
  const positioning = str(record.positioning);
  const mission = str(gp.mission);
  const vision = str(gp.vision);
  const audience =
    str(gp.targetAudience) ?? str(record.targetAudience);
  const preferred = strList(gp.preferredVocabulary);
  const avoid = strList(gp.wordsToAvoid);
  const colors = [...(record.colors ?? [])].map(String).filter(Boolean);
  const primaryColors = strList(gp.primaryColors);
  const secondaryColors = strList(gp.secondaryColors);
  const typography = str(gp.typography);
  const ctaStyle = str(gp.ctaStyle);
  const guidelines = str(record.guidelines) ?? str(gp.description);

  const provenance: BrandProvenanceEntry[] = [];
  const addProv = (
    field: string,
    value: string | undefined,
    source: BrandProvenanceEntry["source"]
  ) => {
    if (!value?.trim()) return;
    provenance.push({ field, value: value.trim(), source });
  };

  addProv("tone", tone, str(gp.tone) ? "BRAND_GUIDELINES" : "BRAND_PROFILE");
  addProv("voice", voice, "BRAND_PROFILE");
  addProv("positioning", positioning, "BRAND_PROFILE");
  addProv("audience", audience, "BRAND_PROFILE");
  addProv("personality", personality, "BRAND_GUIDELINES");
  addProv("writingStyle", writingStyle, "BRAND_GUIDELINES");
  addProv("ctaStyle", ctaStyle, "BRAND_GUIDELINES");
  if (colors.length) {
    provenance.push({
      field: "colors",
      value: colors.join(","),
      source: "BRAND_PROFILE",
    });
  }

  const completenessSections = {
    identity: fieldCompleteness(record.name, mission, vision, record.industry),
    positioning: fieldCompleteness(positioning),
    voice: fieldCompleteness(voice, personality, writingStyle),
    tone: fieldCompleteness(tone),
    messaging: fieldCompleteness(guidelines, ctaStyle, str(gp.formattingRules)),
    visualIdentity: fieldCompleteness(
      colors,
      primaryColors,
      typography,
      str(gp.photographyStyle)
    ),
  };
  const sectionStates = Object.values(completenessSections);
  const completeCount = sectionStates.filter((s) => s === "complete").length;
  const completeness: BrandCompletenessMap = {
    ...completenessSections,
    overall:
      completeCount === 0
        ? "EMPTY"
        : completeCount === sectionStates.length
          ? "COMPLETE"
          : "PARTIAL",
  };

  const missing: BrandMissingInformation[] = [];
  if (completeness.tone === "missing") {
    missing.push({
      key: "tone",
      reason: "Tone not configured on brand",
      severity: "recommended",
    });
  }
  if (completeness.voice === "missing") {
    missing.push({
      key: "voice",
      reason: "Voice not configured on brand",
      severity: "recommended",
    });
  }
  if (completeness.visualIdentity === "missing") {
    missing.push({
      key: "visualIdentity",
      reason: "Visual identity not configured on brand",
      severity: "recommended",
    });
  }

  const status =
    completeness.overall === "EMPTY"
      ? "EMPTY"
      : completeness.overall === "COMPLETE"
        ? "READY"
        : "PARTIAL";

  const brandVersion = record.updatedAt || "1";
  const contextGeneratedAt = nowIso();
  const contextHash = hashContext([
    record.brandId,
    record.organizationId,
    brandVersion,
    tone ?? "",
    voice ?? "",
    positioning ?? "",
    colors.join(","),
  ]);

  const assetReferences = record.logoAssetId
    ? [
        {
          assetId: record.logoAssetId,
          type: "logo" as const,
          purpose: "brand_logo",
          name: "logo",
        },
      ]
    : [];

  return validateBrandContext({
    id: createId("bctx"),
    version: BRAND_CONTEXT_VERSION,
    brandId: record.brandId,
    organizationId: record.organizationId,
    brandVersion,
    executionId: input.executionId,
    status,
    identity: {
      name: record.name,
      mission,
      vision,
      industry: str(record.industry),
      website: str(record.website),
    },
    positioning: {
      statement: positioning,
    },
    audience: {
      primary: audience,
    },
    voice: {
      voice,
      personality,
      writingStyle,
    },
    tone: {
      tone,
      adjectives: tone ? tone.split(/[,/]| and /i).map((s) => s.trim()).filter(Boolean) : [],
    },
    vocabulary: {
      preferred,
      avoid,
    },
    messaging: {
      guidelines,
      ctaStyle,
      formattingRules: str(gp.formattingRules),
      emojiPolicy: str(gp.emojiPolicy),
    },
    visualIdentity: {
      colors,
      primaryColors,
      secondaryColors,
      typography,
      logoRules: str(gp.logoRules),
      photographyStyle: str(gp.photographyStyle),
      illustrationStyle: str(gp.illustrationStyle),
      iconStyle: str(gp.iconStyle),
      socialStyle: str(gp.socialStyle),
      spacingRules: str(gp.spacingRules),
    },
    creativePrinciples: {
      aiRules: str(gp.aiRules),
      localizationRules: str(gp.localizationRules),
    },
    communicationRules: {
      approvalRules: str(gp.approvalRules),
      legalNotes: str(gp.legalNotes),
      complianceNotes: str(gp.complianceNotes),
    },
    prohibitedPatterns: avoid,
    preferredPatterns: preferred,
    ctaRules: ctaStyle,
    assetReferences,
    completeness,
    missingInformation: missing,
    confidence: {
      system: Math.min(1, 0.35 + completeCount * 0.1),
    },
    provenance,
    sourceReferences: [`product-brand:${record.brandId}@${brandVersion}`],
    contextGeneratedAt,
    contextHash,
  });
}

export class BrandIntelligenceEngine implements IBrandIntelligenceEngine {
  readonly implementationStatus = "implemented" as const;

  constructor(private readonly source: IBrandRecordSource) {}

  async getContext(input: GetBrandContextInput): Promise<BrandContext> {
    try {
      if (!input.organizationId?.trim()) {
        throw new BrandIntelligenceError(
          "BRAND_INVALID",
          "organizationId is required"
        );
      }
      if (!input.executionId?.trim()) {
        throw new BrandIntelligenceError(
          "BRAND_INVALID",
          "executionId is required"
        );
      }

      const brandId = input.brandId?.trim();
      if (!brandId) {
        return emptyBrandContext({
          organizationId: input.organizationId,
          executionId: input.executionId,
          status: "MISSING",
          reason: "No brandId provided — unbranded execution (do not invent brand)",
          nowIso: input.nowIso,
          createId: input.createId,
        });
      }

      const record = await this.source.getBrand({
        organizationId: input.organizationId,
        brandId,
        userId: input.userId,
      });

      if (!record) {
        return emptyBrandContext({
          organizationId: input.organizationId,
          executionId: input.executionId,
          brandId,
          status: "MISSING",
          reason: `Brand ${brandId} not found for organization (or cross-tenant)`,
          nowIso: input.nowIso,
          createId: input.createId,
        });
      }

      if (record.organizationId !== input.organizationId) {
        throw new BrandIntelligenceError(
          "BRAND_TENANT_VIOLATION",
          "Brand does not belong to authenticated organization"
        );
      }

      const full = buildFromRecord(record, input);
      const task = resolveBrandTaskKind({
        taskKind: input.taskKind,
        capabilityId: input.capabilityId,
        briefIntent: input.briefIntent,
      });
      return selectBrandContextForTask(full, task);
    } catch (err) {
      if (err instanceof BrandIntelligenceError) throw err;
      throw new BrandIntelligenceError(
        "BRAND_CONTEXT_FAILED",
        err instanceof Error ? err.message : "Brand context failed"
      );
    }
  }
}

export function createBrandIntelligenceEngine(options?: {
  readonly source?: IBrandRecordSource;
}): IBrandIntelligenceEngine {
  return new BrandIntelligenceEngine(
    options?.source ?? createProductBrandRecordSource()
  );
}
