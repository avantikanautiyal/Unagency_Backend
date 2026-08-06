/**
 * M10.17 — Knowledge Intelligence for executions.
 *
 * Assembles real brand guidelines + knowledge context for a prospective
 * execution: the product Brand (Mongo SoT), Brand Brain enrichment (when the
 * Enterprise API runtime is mounted), indexed document knowledge, brand
 * assets, and recent execution history for the organization. Never invents
 * business data — every field is either empty or derived from real records.
 */

import mongoose from "mongoose";
import { brandService, type BrandDto } from "./brand-service";
import MediaFile from "../models/mediaFile.model";
import { searchKnowledgeChunks } from "./knowledge-document-index-service";
import { getEnterpriseApiRuntime } from "../platform/api/runtime/bootstrap-enterprise-api";
import { resolveBrandBrainEngine } from "./brand-brain-sync-service";

export interface ExecutionKnowledge {
  brandGuidelines: Record<string, unknown>;
  knowledgeSnippets: string[];
  campaignHistory: unknown[];
  brandAssets: { id: string; name: string }[];
  styleInstructions: string;
  preferredTerminology: string[];
  negativeInstructions: string[];
  requiredApprovals: string[];
  enrichmentMetadata: Record<string, unknown>;
}

const EMPTY_KNOWLEDGE: ExecutionKnowledge = {
  brandGuidelines: {},
  knowledgeSnippets: [],
  campaignHistory: [],
  brandAssets: [],
  styleInstructions: "",
  preferredTerminology: [],
  negativeInstructions: [],
  requiredApprovals: [],
  enrichmentMetadata: { source: "none" },
};

async function loadBrand(
  organizationId: string,
  brandId: string,
  userId?: string
): Promise<BrandDto | undefined> {
  if (!mongoose.isValidObjectId(brandId)) return undefined;
  if (userId) {
    try {
      return await brandService.get({ userId, brandId });
    } catch {
      // Fall through to direct org-scoped lookup (e.g. system/internal calls).
    }
  }
  const Brands = (await import("../models/brand.model")).default;
  const doc = await Brands.findOne({
    _id: brandId,
    organizationId: new mongoose.Types.ObjectId(organizationId),
  });
  if (!doc) return undefined;
  const { toBrandDto } = await import("./brand-service");
  return toBrandDto(doc);
}

function buildStyleInstructions(
  brand: BrandDto | undefined,
  brainAdjectives: readonly string[],
  brainDoList: readonly string[]
): string {
  if (!brand) return "";
  const gp = brand.guidelinesProfile ?? {};
  const parts: string[] = [];
  const tone = String(gp.tone ?? brand.voice ?? "").trim();
  if (tone) parts.push(`Tone: ${tone}`);
  if (brainAdjectives.length) parts.push(`Voice adjectives: ${brainAdjectives.join(", ")}`);
  const personality = String(gp.brandPersonality ?? "").trim();
  if (personality) parts.push(`Personality: ${personality}`);
  const writingStyle = String(gp.writingStyle ?? "").trim();
  if (writingStyle) parts.push(`Writing style: ${writingStyle}`);
  const positioning = String(brand.positioning ?? "").trim();
  if (positioning) parts.push(`Positioning: ${positioning}`);
  if (brainDoList.length) parts.push(`Do: ${brainDoList.join("; ")}`);
  const ctaStyle = String(gp.ctaStyle ?? "").trim();
  if (ctaStyle) parts.push(`CTA style: ${ctaStyle}`);
  const formattingRules = String(gp.formattingRules ?? "").trim();
  if (formattingRules) parts.push(`Formatting: ${formattingRules}`);
  const emojiPolicy = String(gp.emojiPolicy ?? "").trim();
  if (emojiPolicy) parts.push(`Emoji policy: ${emojiPolicy}`);
  return parts.join(". ");
}

export async function assembleExecutionKnowledge(input: {
  organizationId: string;
  brandId?: string;
  userId?: string;
  prompt: string;
  service?: string;
}): Promise<ExecutionKnowledge> {
  if (!input.organizationId) return EMPTY_KNOWLEDGE;

  const brand = input.brandId
    ? await loadBrand(input.organizationId, input.brandId, input.userId)
    : undefined;

  const gp = brand?.guidelinesProfile ?? {};

  const brandGuidelines: Record<string, unknown> = brand
    ? {
        ...gp,
        voice: brand.voice,
        positioning: brand.positioning,
        guidelines: brand.guidelines,
        colors: brand.colors,
        industry: brand.industry,
        targetAudience: gp.targetAudience ?? brand.targetAudience,
        name: brand.name,
      }
    : {};

  let brainAdjectives: string[] = [];
  let brainDoList: string[] = [];
  let brainDontList: string[] = [];
  let brainApprovalRules: string[] = [];
  let brainProhibitedTopics: string[] = [];
  let brandBrainVersion: number | undefined;
  const runtime = getEnterpriseApiRuntime();
  if (runtime) {
    try {
      const engine = await resolveBrandBrainEngine();
      const current = await engine.getCurrent(input.organizationId);
      if (current.ok && current.value) {
        brandBrainVersion = current.value.version;
        const doc = current.value.document;
        brainAdjectives = [...(doc.tone?.adjectives ?? [])];
        brainDoList = [...(doc.tone?.doList ?? [])];
        brainDontList = [...(doc.tone?.dontList ?? [])];
        brainProhibitedTopics = [...(doc.contentPreferences?.prohibitedTopics ?? [])];
        brainApprovalRules = doc.policies
          .filter((p) => p.kind === "approval")
          .flatMap((p) => [...p.rules]);
      }
    } catch {
      // Brand Brain unavailable — proceed with product-brand-only knowledge.
    }
  }

  const [knowledgeHits, brandAssetDocs, recentExecutions] = await Promise.all([
    searchKnowledgeChunks({
      organizationId: input.organizationId,
      brandId: input.brandId,
      q: input.prompt,
      limit: 5,
    }).catch(() => []),
    input.brandId && mongoose.isValidObjectId(input.brandId)
      ? MediaFile.find({
          organizationId: input.organizationId,
          brandId: input.brandId,
          status: { $ne: "deleted" },
        })
          .sort({ updatedAt: -1 })
          .limit(10)
          .select("fileName")
          .catch(() => [])
      : Promise.resolve([]),
    (async () => {
      try {
        const { EnterpriseExecution } = await import(
          "../platform/infrastructure/durability/mongo/models/enterprise-execution.model"
        );
        return await EnterpriseExecution.find({
          organizationId: input.organizationId,
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .select("executionId promptPreview status createdAt");
      } catch {
        return [];
      }
    })(),
  ]);

  const preferredVocabulary = Array.isArray(gp.preferredVocabulary)
    ? (gp.preferredVocabulary as string[])
    : [];
  const wordsToAvoid = Array.isArray(gp.wordsToAvoid)
    ? (gp.wordsToAvoid as string[])
    : [];

  const negativeInstructions = [
    ...new Set([...wordsToAvoid, ...brainDontList, ...brainProhibitedTopics]),
  ].map((w) => `Avoid: ${w}`);

  const requiredApprovals = [
    ...(gp.approvalRules ? [String(gp.approvalRules)] : []),
    ...brainApprovalRules,
  ];

  return {
    brandGuidelines,
    knowledgeSnippets: knowledgeHits.map((h) => h.subtitle ?? h.title).filter(Boolean),
    campaignHistory: (recentExecutions as any[]).map((e) => ({
      executionId: e.executionId,
      promptPreview: e.promptPreview,
      status: e.status,
      createdAt: e.createdAt,
    })),
    brandAssets: (brandAssetDocs as any[]).map((a) => ({
      id: a._id.toString(),
      name: a.fileName || "asset",
    })),
    styleInstructions: buildStyleInstructions(brand, brainAdjectives, brainDoList),
    preferredTerminology: preferredVocabulary,
    negativeInstructions,
    requiredApprovals,
    enrichmentMetadata: {
      brandId: input.brandId,
      organizationId: input.organizationId,
      source: brand ? "product-brand" : "none",
      brandBrainVersion,
      knowledgeChunkCount: knowledgeHits.length,
      service: input.service,
      generatedAt: new Date().toISOString(),
    },
  };
}
