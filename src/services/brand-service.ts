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
import { ApiError } from "../utils/apiError";
import {
  assertUserBelongsToOrganization,
  resolveCustomerOrganizationId,
} from "./product-asset-service";

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

    if (input.logoAssetId) {
      await this.assertAssetInOrg(input.logoAssetId, organizationId);
    }

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
    if (p.colors != null) doc.colors = p.colors.map(String);
    if (p.voice != null) doc.voice = String(p.voice);
    if (p.positioning != null) doc.positioning = String(p.positioning);
    if (p.guidelines != null) doc.guidelines = String(p.guidelines);
    if (p.industry != null) doc.industry = String(p.industry);
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
    doc.status = "active";
    doc.archivedAt = undefined;
    await doc.save();
    return toBrandDto(doc);
  }

  async remove(input: {
    userId: string;
    brandId: string;
  }): Promise<{ deleted: true; id: string }> {
    const doc = await this.loadOwned(input.userId, input.brandId, true);
    const id = doc._id.toString();
    await MediaFile.updateMany(
      { brandId: doc._id },
      { $unset: { brandId: 1 } }
    );
    await Brands.deleteOne({ _id: doc._id });
    return { deleted: true, id };
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
