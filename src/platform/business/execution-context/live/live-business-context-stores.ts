/**
 * Live business context stores — Mongo + Brand Brain as sources of truth.
 * Implements IExecutionContextStores as a read projection (not a second database).
 */

import mongoose, { type Types } from "mongoose";
import type { IBrandBrainEngine } from "../../brand-brain/interfaces/brand-brain";
import type {
  BrandProfile,
  Campaign,
  KnowledgeDocument,
  KnowledgeRepository,
} from "../../contracts/content";
import type { Organization, Project, BusinessUser } from "../../contracts/tenancy";
import type { BusinessRole } from "../../contracts/enums";
import type { IExecutionContextStores } from "../stores/execution-context-stores";
import { brandProfileFromBrandBrainDocument } from "./brand-from-brain";
import { mapBrandDtoToBrandBrainDocument, syncProductBrandToBrain } from "../../../../services/brand-brain-sync-service";
import { toBrandDto, type BrandDto } from "../../../../services/brand-service";

export interface LiveBusinessContextStoresDeps {
  readonly brandBrain: IBrandBrainEngine;
  readonly findUserById: (userId: string) => Promise<{
    _id: Types.ObjectId | string;
    email?: string;
    name?: string;
    role?: string;
    isActive?: boolean;
  } | null>;
  readonly findOrganizationById: (organizationId: string) => Promise<{
    _id: Types.ObjectId | string;
    companyName?: string;
    owner?: Types.ObjectId | string;
    status?: string;
    industry?: string;
  } | null>;
  readonly findOrganizationOwnedByUser: (userId: string) => Promise<{
    _id: Types.ObjectId | string;
  } | null>;
  readonly findAcceptedTeamOrganization: (userId: string) => Promise<{
    Organization: Types.ObjectId | string;
  } | null>;
  readonly findProjectById: (projectId: string) => Promise<{
    _id: Types.ObjectId | string;
    orgId?: Types.ObjectId | string;
    title?: string;
    status?: string;
    userId?: Types.ObjectId | string;
  } | null>;
  /** Optional campaign overlay (platform-only; no Mongo campaign model). */
  readonly findCampaignById?: (campaignId: string) => Promise<Campaign | null>;
  readonly nowIso?: () => string;
}

/**
 * Request-scoped cache for one execution resolve cycle.
 * Avoids repeated Mongo/Brand Brain reads within a single resolve().
 */
export class LiveBusinessContextStores implements IExecutionContextStores {
  private readonly orgCache = new Map<string, Organization | undefined>();
  private readonly userCache = new Map<string, BusinessUser | undefined>();
  private readonly brandCache = new Map<string, BrandProfile | undefined>();
  private readonly projectCache = new Map<string, Project | undefined>();
  private readonly brandListCache = new Map<string, readonly BrandProfile[]>();

  constructor(private readonly deps: LiveBusinessContextStoresDeps) {}

  async getOrganization(organizationId: string): Promise<Organization | undefined> {
    if (this.orgCache.has(organizationId)) {
      return this.orgCache.get(organizationId);
    }
    const doc = await this.deps.findOrganizationById(organizationId);
    if (!doc) {
      this.orgCache.set(organizationId, undefined);
      return undefined;
    }
    const org: Organization = {
      organizationId: String(doc._id),
      name: doc.companyName ?? "Organization",
      ownerUserId: doc.owner ? String(doc.owner) : "unknown",
      createdAt: this.deps.nowIso?.() ?? new Date().toISOString(),
      status: doc.status === "suspended" ? "suspended" : "active",
    };
    this.orgCache.set(organizationId, org);
    return org;
  }

  async getUser(userId: string): Promise<BusinessUser | undefined> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }
    const doc = await this.deps.findUserById(userId);
    if (!doc || doc.isActive === false) {
      this.userCache.set(userId, undefined);
      return undefined;
    }

    const organizationId = await this.resolveUserOrganizationId(userId);
    if (!organizationId) {
      this.userCache.set(userId, undefined);
      return undefined;
    }

    const user: BusinessUser = {
      userId: String(doc._id),
      organizationId,
      email: doc.email ?? "",
      displayName: doc.name ?? doc.email ?? "User",
      roles: mapLegacyRole(doc.role),
      createdAt: this.deps.nowIso?.() ?? new Date().toISOString(),
    };
    this.userCache.set(userId, user);
    return user;
  }

  async getBrand(brandId: string): Promise<BrandProfile | undefined> {
    if (this.brandCache.has(brandId)) {
      return this.brandCache.get(brandId);
    }
    // M10.17 — Mongo product Brand is source of truth when it exists.
    const productBrand = await this.findProductBrandById(brandId);
    if (productBrand) {
      const profile = brandProfileFromBrandBrainDocument(
        mapBrandDtoToBrandBrainDocument(productBrand)
      );
      this.brandCache.set(brandId, profile);
      try {
        await syncProductBrandToBrain(productBrand, this.deps.brandBrain);
      } catch (err) {
        console.warn(
          `[UNAGENCY OS] brand.brain.sync.failed brand=${brandId} — ${
            err instanceof Error ? err.message : "unknown"
          }`
        );
      }
      return profile;
    }
    // Brand Brain fallback (sampleBrandBrain org-level convention) — only
    // used when no Mongo product brand exists for this organization.
    const profile = await this.findBrandAcrossKnownPattern(brandId);
    this.brandCache.set(brandId, profile);
    return profile;
  }

  async listBrandsForOrganization(organizationId: string): Promise<readonly BrandProfile[]> {
    if (this.brandListCache.has(organizationId)) {
      return this.brandListCache.get(organizationId)!;
    }
    // M10.17 — prefer Mongo product brands over sampleBrandBrain when present.
    const productBrands = await this.listProductBrandsForOrg(organizationId);
    if (productBrands.length) {
      const profiles = productBrands.map((b) =>
        brandProfileFromBrandBrainDocument(mapBrandDtoToBrandBrainDocument(b))
      );
      profiles.forEach((p) => this.brandCache.set(p.brandId, p));
      this.brandListCache.set(organizationId, profiles);
      try {
        await syncProductBrandToBrain(productBrands[0]!, this.deps.brandBrain);
      } catch {
        // Non-fatal — product brand profile is already in the cache.
      }
      return profiles;
    }
    const current = await this.deps.brandBrain.getCurrent(organizationId);
    if (!current.ok || !current.value) {
      this.brandListCache.set(organizationId, []);
      return [];
    }
    const profile = brandProfileFromBrandBrainDocument(current.value.document);
    this.brandCache.set(profile.brandId, profile);
    this.brandListCache.set(organizationId, [profile]);
    return [profile];
  }

  private async findProductBrandById(
    brandId: string
  ): Promise<BrandDto | undefined> {
    if (!mongoose.isValidObjectId(brandId)) return undefined;
    // No live Mongo connection (e.g. in-memory/testing harnesses that inject
    // deps directly) — Mongoose would otherwise buffer this query until its
    // internal timeout. Skip straight to the Brand Brain fallback instead.
    if (mongoose.connection.readyState !== 1) return undefined;
    try {
      const Brands = (await import("../../../../models/brand.model")).default;
      const doc = await Brands.findById(brandId);
      if (!doc) return undefined;
      return toBrandDto(doc);
    } catch {
      return undefined;
    }
  }

  private async listProductBrandsForOrg(
    organizationId: string
  ): Promise<BrandDto[]> {
    if (!mongoose.isValidObjectId(organizationId)) return [];
    if (mongoose.connection.readyState !== 1) return [];
    try {
      const Brands = (await import("../../../../models/brand.model")).default;
      const docs = await Brands.find({
        organizationId: new mongoose.Types.ObjectId(organizationId),
        status: "active",
      })
        .sort({ updatedAt: -1 })
        .limit(50);
      return docs.map(toBrandDto);
    } catch {
      return [];
    }
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    if (this.projectCache.has(projectId)) {
      return this.projectCache.get(projectId);
    }
    const doc = await this.deps.findProjectById(projectId);
    if (!doc || !doc.orgId) {
      this.projectCache.set(projectId, undefined);
      return undefined;
    }
    const project: Project = {
      projectId: String(doc._id),
      organizationId: String(doc.orgId),
      workspaceId: "ws_default",
      name: doc.title ?? "Project",
      createdAt: this.deps.nowIso?.() ?? new Date().toISOString(),
    };
    this.projectCache.set(projectId, project);
    return project;
  }

  async getCampaign(campaignId: string): Promise<Campaign | undefined> {
    if (!this.deps.findCampaignById) return undefined;
    return (await this.deps.findCampaignById(campaignId)) ?? undefined;
  }

  async getKnowledgeRepository(
    _repositoryId: string
  ): Promise<KnowledgeRepository | undefined> {
    return undefined;
  }

  async listKnowledgeDocumentsForOrganization(
    _organizationId: string
  ): Promise<readonly KnowledgeDocument[]> {
    return [];
  }

  /** Ensure Brand Brain exists only when a real synced document is needed.
   * Phase 2: NEVER bootstrap sampleBrandBrain into production orgs.
   */
  async ensureBrandBrainFromOrganization(
    organizationId: string,
    _organizationName: string,
    _industry?: string
  ): Promise<void> {
    const current = await this.deps.brandBrain.getCurrent(organizationId);
    const hasIdentityName = Boolean(
      current.ok &&
        current.value &&
        (current.value.document.identity?.name?.trim() ||
          current.value.document.organization?.legalName?.trim())
    );
    if (hasIdentityName) return;
    const productBrands = await this.listProductBrandsForOrg(organizationId);
    if (productBrands[0]) {
      try {
        await syncProductBrandToBrain(productBrands[0], this.deps.brandBrain);
        return;
      } catch (err) {
        console.warn(
          `[UNAGENCY OS] brand.brain.sync.failed org=${organizationId} — ${
            err instanceof Error ? err.message : "unknown"
          }`
        );
        return;
      }
    }
    console.warn(
      `[UNAGENCY OS] brand.context.missing org=${organizationId} — skipping sampleBrandBrain bootstrap (Phase 2)`
    );
  }

  private async resolveUserOrganizationId(userId: string): Promise<string | undefined> {
    const owned = await this.deps.findOrganizationOwnedByUser(userId);
    if (owned) return String(owned._id);
    const membership = await this.deps.findAcceptedTeamOrganization(userId);
    if (membership) return String(membership.Organization);
    return undefined;
  }

  private async findBrandAcrossKnownPattern(
    brandId: string
  ): Promise<BrandProfile | undefined> {
    // Convention from Brand Brain: brand_${organizationId}
    if (brandId.startsWith("brand_")) {
      const organizationId = brandId.slice("brand_".length);
      const brands = await this.listBrandsForOrganization(organizationId);
      return brands.find((b) => b.brandId === brandId);
    }
    return undefined;
  }
}

function mapLegacyRole(role?: string): BusinessRole[] {
  switch (role) {
    case "superadmin":
    case "admin":
      return ["admin"];
    case "customer":
      return ["owner"];
    case "servicing":
      return ["manager"];
    case "resource":
      return ["contributor"];
    default:
      return ["viewer"];
  }
}

export function createDefaultMongoLiveContextDeps(
  brandBrain: IBrandBrainEngine,
  nowIso?: () => string
): LiveBusinessContextStoresDeps {
  return {
    brandBrain,
    nowIso,
    findUserById: async (userId) => {
      const Users = (await import("../../../../models/users.model")).default;
      return Users.findById(userId).lean();
    },
    findOrganizationById: async (organizationId) => {
      const Organizations = (await import("../../../../models/organization.model")).default;
      return Organizations.findById(organizationId).lean();
    },
    findOrganizationOwnedByUser: async (userId) => {
      const Organizations = (await import("../../../../models/organization.model")).default;
      return Organizations.findOne({ owner: userId }).lean();
    },
    findAcceptedTeamOrganization: async (userId) => {
      const Teams = (await import("../../../../models/team.model")).default;
      return Teams.findOne({
        userId,
        invitationStatus: "accepted",
      }).lean();
    },
    findProjectById: async (projectId) => {
      const Projects = (await import("../../../../models/projects.model")).default;
      return Projects.findById(projectId).lean();
    },
  };
}
