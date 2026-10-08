/**
 * Brand product domain service (M10.12).
 * Tenant isolation via organization membership (reuse product-asset helpers).
 */

import mongoose from "mongoose";
import Brands, {
  type IBrand,
  type IBrandGuidelinesProfile,
  type BrandStatus,
} from "../models/brand.model";
import MediaFile from "../models/mediaFile.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import ChatRoom from "../models/chatRoom.model";
import KnowledgeChunk from "../models/knowledgeChunk.model";
import SavedRoutes from "../models/savedRoute.model";
import SearchAudit from "../models/searchAudit.model";
import { MultipartUploadSession } from "../models/multipart-upload-session.model";
import {
  CollabMessage,
  Conversation,
  ConversationMember,
  ConversationSettings,
  Mention,
  MessageAttachment,
  PinnedMessage,
  Reaction,
  ReadReceipt,
  Thread,
} from "../platform/collaboration/models";
import { EnterpriseExecution } from "../platform/infrastructure/durability/mongo/models/enterprise-execution.model";
import { EnterpriseExecutionExtras } from "../platform/infrastructure/durability/mongo/models/enterprise-execution-extras.model";
import { EnterpriseExecutionObservability } from "../platform/infrastructure/durability/mongo/models/enterprise-execution-observability.model";
import { EnterpriseArtifact } from "../platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import { ApiError } from "../utils/apiError";
import {
  assertUserBelongsToOrganization,
  productAssetService,
  resolveCustomerOrganizationId,
} from "./product-asset-service";

/** CDF collections are registered lazily, so delete through the raw collections. */
async function deleteCdfSessions(sessionIds: string[]): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const bySession = { sessionId: { $in: sessionIds } };
  const artifactIds = (await db
    .collection("cdf_canonical_artifacts")
    .distinct("artifactId", bySession)) as string[];
  await Promise.all([
    db.collection("cdf_sessions").deleteMany(bySession),
    db.collection("cdf_requirement_bags").deleteMany(bySession),
    db.collection("cdf_canonical_artifacts").deleteMany(bySession),
    artifactIds.length
      ? db
          .collection("cdf_canonical_artifact_versions")
          .deleteMany({ artifactId: { $in: artifactIds } })
      : Promise.resolve(),
    artifactIds.length
      ? db
          .collection("cdf_canonical_artifact_idempotency")
          .deleteMany({ artifactId: { $in: artifactIds } })
      : Promise.resolve(),
  ]);
}

export type { IBrandGuidelinesProfile } from "../models/brand.model";

export type BrandDto = {
  id: string;
  organizationId: string;
  ownerUserId: string;
  name: string;
  status: BrandStatus;
  logoAssetId?: string;
  colors: string[];
  voice: string;
  positioning: string;
  guidelines: string;
  industry: string;
  targetAudience: string;
  website: string;
  guidelinesProfile: IBrandGuidelinesProfile;
  memberUserIds: string[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function toBrandDto(doc: IBrand): BrandDto {
  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    ownerUserId: doc.ownerUserId.toString(),
    name: doc.name,
    status: doc.status,
    logoAssetId: doc.logoAssetId?.toString(),
    colors: Array.isArray(doc.colors) ? doc.colors.map(String) : [],
    voice: doc.voice ?? "",
    positioning: doc.positioning ?? "",
    guidelines: doc.guidelines ?? "",
    industry: doc.industry ?? "",
    targetAudience: doc.targetAudience ?? "",
    website: doc.website ?? "",
    guidelinesProfile: (doc.guidelinesProfile ?? {}) as IBrandGuidelinesProfile,
    memberUserIds: (doc.memberUserIds ?? []).map((id) => id.toString()),
    archivedAt: doc.archivedAt ? doc.archivedAt.toISOString() : undefined,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}
const GUIDELINES_STRING_FIELDS: readonly (keyof IBrandGuidelinesProfile)[] = [
  "mission",
  "vision",
  "description",
  "brandStory",
  "targetAudience",
  "brandPersonality",
  "tone",
  "writingStyle",
  "typography",
  "logoRules",
  "spacingRules",
  "photographyStyle",
  "illustrationStyle",
  "iconStyle",
  "socialStyle",
  "ctaStyle",
  "formattingRules",
  "emojiPolicy",
  "localizationRules",
  "aiRules",
  "approvalRules",
  "voiceGuidelines",
  "legalNotes",
  "complianceNotes",
];

const GUIDELINES_ARRAY_FIELDS: readonly (keyof IBrandGuidelinesProfile)[] = [
  "competitors",
  "preferredVocabulary",
  "wordsToAvoid",
  "primaryColors",
  "secondaryColors",
];

/** Only persist fields the user actually provided — never fabricate values. */
export function sanitizeGuidelinesProfile(
  input: Partial<IBrandGuidelinesProfile> | undefined
): IBrandGuidelinesProfile {
  const out: IBrandGuidelinesProfile = {};
  if (!input) return out;
  for (const key of GUIDELINES_STRING_FIELDS) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  for (const key of GUIDELINES_ARRAY_FIELDS) {
    const v = input[key];
    if (Array.isArray(v)) {
      const cleaned = v.map(String).map((s) => s.trim()).filter(Boolean);
      if (cleaned.length) out[key] = cleaned;
    }
  }
  return out;
}

export function mergeGuidelinesProfile(
  existing: IBrandGuidelinesProfile | undefined,
  patch: Partial<IBrandGuidelinesProfile> | undefined
): IBrandGuidelinesProfile {
  return { ...(existing ?? {}), ...sanitizeGuidelinesProfile(patch) };
}

async function resolveOrg(
  userId: string,
  organizationId?: string
): Promise<string> {
  return resolveCustomerOrganizationId(userId, organizationId);
}

/** Case-insensitive, whitespace-tolerant exact match (e.g. " tata  group" ≡ "Tata Group"). */
function normalizedMatch(value: string): RegExp {
  const tokens = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^\\s*${tokens.join("\\s+")}\\s*$`, "i");
}

async function assertUniqueBrandNameIndustry(input: {
  organizationId: string;
  name: string;
  industry: string;
  excludeBrandId?: string;
}): Promise<void> {
  const industry = input.industry.trim();
  const filter: Record<string, unknown> = {
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    status: "active",
    name: normalizedMatch(input.name),
    industry: industry
      ? normalizedMatch(industry)
      : { $not: /\S/ },
  };
  if (input.excludeBrandId) {
    filter._id = { $ne: new mongoose.Types.ObjectId(input.excludeBrandId) };
  }
  if (await Brands.exists(filter)) {
    throw new ApiError(
      industry
        ? `A brand named "${input.name.trim()}" in ${industry} already exists.`
        : `A brand named "${input.name.trim()}" already exists.`,
      409
    );
  }
}

export class BrandService {
  async create(input: {
    userId: string;
    organizationId?: string;
    name: string;
    colors?: string[];
    voice?: string;
    positioning?: string;
    guidelines?: string;
    industry?: string;
    targetAudience?: string;
    website?: string;
    logoAssetId?: string;
    guidelinesProfile?: Partial<IBrandGuidelinesProfile>;
  }): Promise<BrandDto> {
    const organizationId = await resolveOrg(
      input.userId,
      input.organizationId
    );
    const name = String(input.name ?? "").trim();
    if (!name) throw new ApiError("name is required", 400);

    await assertUniqueBrandNameIndustry({
      organizationId,
      name,
      industry: input.industry ?? "",
    });

    if (input.logoAssetId) {
      await this.assertAssetInOrg(input.logoAssetId, organizationId);
    }

    const activeCount = await Brands.countDocuments({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      status: "active",
    });
    const { assertBrandLimit } = await import("../billing/entitlement-service");
    await assertBrandLimit(input.userId, organizationId, activeCount);

    const doc = await Brands.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      ownerUserId: new mongoose.Types.ObjectId(input.userId),
      name,
      status: "active",
      colors: input.colors ?? [],
      voice: input.voice ?? "",
      positioning: input.positioning ?? "",
      guidelines: input.guidelines ?? "",
      industry: input.industry ?? "",
      targetAudience: input.targetAudience ?? "",
      website: input.website ?? "",
      guidelinesProfile: sanitizeGuidelinesProfile(input.guidelinesProfile),
      logoAssetId: input.logoAssetId
        ? new mongoose.Types.ObjectId(input.logoAssetId)
        : undefined,
      memberUserIds: [new mongoose.Types.ObjectId(input.userId)],
    });
    const dto = toBrandDto(doc);
    // M10.19 — auto-provision brand collaboration channel (non-blocking)
    void import("./collaboration/collaboration-channel-service")
      .then(({ collaborationChannelService }) => {
        if (!collaborationChannelService.isConfigured()) return;
        return collaborationChannelService.provisionForBrand({
          brandId: dto.id,
          name: dto.name,
          organizationId: dto.organizationId,
          memberUserIds: dto.memberUserIds,
          createdByUserId: input.userId,
        });
      })
      .catch((err) => {
        console.warn(
          "[brand-service] collaboration channel provision failed (non-fatal):",
          err instanceof Error ? err.message : err
        );
      });
    return dto;
  }

  async list(input: {
    userId: string;
    organizationId?: string;
    status?: BrandStatus | "all";
    q?: string;
  }): Promise<BrandDto[]> {
    let organizationId: string;
    try {
      organizationId = await resolveOrg(input.userId, input.organizationId);
    } catch (err) {
      // No organisation yet — empty catalog, not a hard failure for Choose Brand.
      if (
        err instanceof ApiError &&
        (err.statusCode === 400 || err.statusCode === 403)
      ) {
        return [];
      }
      throw err;
    }
    const filter: Record<string, unknown> = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
    };
    if (input.status && input.status !== "all") {
      filter.status = input.status;
    } else if (!input.status) {
      filter.status = "active";
    }
    if (input.q?.trim()) {
      const q = input.q.trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { voice: { $regex: q, $options: "i" } },
        { positioning: { $regex: q, $options: "i" } },
        { industry: { $regex: q, $options: "i" } },
      ];
    }
    const docs = await Brands.find(filter).sort({ updatedAt: -1 }).limit(200);
    return docs.map(toBrandDto);
  }

  async get(input: {
    userId: string;
    brandId: string;
  }): Promise<BrandDto> {
    const doc = await this.loadOwned(input.userId, input.brandId);
    return toBrandDto(doc);
  }

  async update(input: {
    userId: string;
    brandId: string;
    patch: Partial<{
      name: string;
      colors: string[];
      voice: string;
      positioning: string;
      guidelines: string;
      industry: string;
      targetAudience: string;
      website: string;
      logoAssetId: string | null;
      memberUserIds: string[];
      guidelinesProfile: Partial<IBrandGuidelinesProfile>;
    }>;
  }): Promise<BrandDto> {
    const doc = await this.loadOwned(input.userId, input.brandId);
    const p = input.patch;
    if (p.name != null) {
      const name = String(p.name).trim();
      if (!name) throw new ApiError("name cannot be empty", 400);
      doc.name = name;
    }
    if (p.industry != null) doc.industry = String(p.industry);
    if ((p.name != null || p.industry != null) && doc.status === "active") {
      await assertUniqueBrandNameIndustry({
        organizationId: doc.organizationId.toString(),
        name: doc.name,
        industry: doc.industry ?? "",
        excludeBrandId: String(doc._id),
      });
    }
    if (p.colors != null) doc.colors = p.colors.map(String);
    if (p.voice != null) doc.voice = String(p.voice);
    if (p.positioning != null) doc.positioning = String(p.positioning);
    if (p.guidelines != null) doc.guidelines = String(p.guidelines);
    if (p.targetAudience != null) doc.targetAudience = String(p.targetAudience);
    if (p.website != null) doc.website = String(p.website);
    if (p.guidelinesProfile != null) {
      doc.guidelinesProfile = mergeGuidelinesProfile(
        doc.guidelinesProfile,
        p.guidelinesProfile
      );
      doc.markModified("guidelinesProfile");
    }
    if (p.logoAssetId === null) {
      doc.logoAssetId = undefined;
    } else if (p.logoAssetId) {
      await this.assertAssetInOrg(
        p.logoAssetId,
        doc.organizationId.toString()
      );
      doc.logoAssetId = new mongoose.Types.ObjectId(p.logoAssetId);
    }
    if (p.memberUserIds) {
      doc.memberUserIds = p.memberUserIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
    }
    await doc.save();
    const dto = toBrandDto(doc);
    return dto;
  }

  async archive(input: {
    userId: string;
    brandId: string;
  }): Promise<BrandDto> {
    const doc = await this.loadOwned(input.userId, input.brandId);
    doc.status = "archived";
    doc.archivedAt = new Date();
    await doc.save();
    return toBrandDto(doc);
  }

  async restore(input: {
    userId: string;
    brandId: string;
  }): Promise<BrandDto> {
    const doc = await this.loadOwned(input.userId, input.brandId, true);
    await assertUniqueBrandNameIndustry({
      organizationId: doc.organizationId.toString(),
      name: doc.name,
      industry: doc.industry ?? "",
      excludeBrandId: String(doc._id),
    });
    doc.status = "active";
    doc.archivedAt = undefined;
    await doc.save();
    return toBrandDto(doc);
  }

  /**
   * Permanent delete: removes the brand and everything created under it
   * (projects, briefs, service chats, executions, generated creatives, vault files).
   * Brand row is deleted last so a failed cascade can be retried.
   */
  async remove(input: {
    userId: string;
    brandId: string;
  }): Promise<{ deleted: true; id: string; deletedProjects: number }> {
    const doc = await this.loadOwned(input.userId, input.brandId, true);
    const id = doc._id.toString();
    const brandOid = doc._id;
    const organizationId = doc.organizationId.toString();

    const [projects, requirements, conversations, executions] = await Promise.all([
      Projects.find({ brandId: brandOid })
        .select("_id files executionId sessionId")
        .lean(),
      Requirement.find({ brandId: brandOid }).select("_id").lean(),
      Conversation.find({ brandId: brandOid }).select("_id executionId").lean(),
      EnterpriseExecution.find({ organizationId, brandId: id })
        .select("executionId")
        .lean(),
    ]);
    const conversationIds = conversations.map((c) => c._id);
    const messageExecutionIds = conversationIds.length
      ? ((await CollabMessage.distinct("executionId", {
          conversationId: { $in: conversationIds },
        })) as unknown[])
      : [];
    const executionIds = [
      ...new Set(
        [
          ...projects.map((p) => p.executionId),
          ...conversations.map((c) => c.executionId as string | undefined),
          ...executions.map((e) => e.executionId),
          ...messageExecutionIds,
        ]
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
      ),
    ];
    const sessionIds = [
      ...new Set(projects.map((p) => p.sessionId?.trim()).filter(Boolean)),
    ] as string[];

    try {
      await productAssetService.hardDeleteMatching({
        userId: input.userId,
        organizationId,
        brandId: id,
        projectIds: projects.map((p) => String(p._id)),
        briefIds: requirements.map((r) => String(r._id)),
        executionIds,
        assetIds: projects.flatMap((p) =>
          Array.isArray(p.files) ? p.files.map(String) : []
        ),
      });
    } catch (err) {
      console.warn(
        "[brand-service] vault cascade failed:",
        err instanceof Error ? err.message : String(err)
      );
      throw new ApiError(
        "Could not delete this brand's files. Try again in a moment.",
        503
      );
    }

    if (conversationIds.length) {
      const byConversation = { conversationId: { $in: conversationIds } };
      await Promise.all([
        CollabMessage.deleteMany(byConversation),
        MessageAttachment.deleteMany(byConversation),
        Thread.deleteMany(byConversation),
        Reaction.deleteMany(byConversation),
        ReadReceipt.deleteMany(byConversation),
        PinnedMessage.deleteMany(byConversation),
        Mention.deleteMany(byConversation),
        ConversationSettings.deleteMany(byConversation),
        ConversationMember.deleteMany(byConversation),
      ]);
      await Conversation.deleteMany({ _id: { $in: conversationIds } });
    }

    if (executionIds.length) {
      const byExecution = { executionId: { $in: executionIds } };
      const artifactIds = (await EnterpriseArtifact.distinct(
        "artifactId",
        byExecution
      )) as string[];
      await Promise.all([
        EnterpriseExecution.deleteMany(byExecution),
        EnterpriseExecutionExtras.deleteMany(byExecution),
        EnterpriseExecutionObservability.deleteMany(byExecution),
        EnterpriseArtifact.deleteMany(byExecution),
        EnterpriseBlobMetadata.deleteMany({
          $or: [byExecution, { artifactId: { $in: artifactIds } }],
        }),
        SavedRoutes.deleteMany({ organizationId: doc.organizationId, ...byExecution }),
      ]);
    }

    if (sessionIds.length) {
      await deleteCdfSessions(sessionIds);
    }

    await Promise.all([
      Projects.deleteMany({ _id: { $in: projects.map((p) => p._id) } }),
      Requirement.deleteMany({ brandId: brandOid }),
      ChatRoom.deleteMany({ brandId: brandOid }),
      KnowledgeChunk.deleteMany({ brandId: brandOid }),
      MultipartUploadSession.deleteMany({ brandId: brandOid }),
      SearchAudit.deleteMany({ brandId: id }),
    ]);

    await Brands.deleteOne({ _id: brandOid });
    return { deleted: true, id, deletedProjects: projects.length };
  }

  private async loadOwned(
    userId: string,
    brandId: string,
    allowArchived = false
  ): Promise<IBrand> {
    if (!mongoose.isValidObjectId(brandId)) {
      throw new ApiError("Invalid brandId", 400);
    }
    const doc = await Brands.findById(brandId);
    if (!doc) throw new ApiError("Brand not found", 404);
    await assertUserBelongsToOrganization(
      userId,
      doc.organizationId.toString()
    );
    if (!allowArchived && doc.status === "archived") {
      throw new ApiError("Brand is archived", 410);
    }
    return doc;
  }

  private async assertAssetInOrg(
    assetId: string,
    organizationId: string
  ): Promise<void> {
    if (!mongoose.isValidObjectId(assetId)) {
      throw new ApiError("Invalid logoAssetId", 400);
    }
    const asset = await MediaFile.findOne({
      _id: assetId,
      organizationId: new mongoose.Types.ObjectId(organizationId),
      status: { $ne: "deleted" },
    });
    if (!asset) throw new ApiError("Logo asset not found in organisation", 404);
  }
}

export const brandService = new BrandService();
