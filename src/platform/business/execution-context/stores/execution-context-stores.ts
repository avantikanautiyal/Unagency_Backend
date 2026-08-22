/**
 * In-memory business entity stores for execution context resolution.
 * Used by tests/fixtures — not authoritative for production HTTP.
 */

import type {
  BrandProfile,
  Campaign,
  KnowledgeDocument,
  KnowledgeRepository,
} from "../../contracts/content";
import type { Organization, Project, BusinessUser } from "../../contracts/tenancy";

export interface IExecutionContextStores {
  getOrganization(organizationId: string): Promise<Organization | undefined>;
  getUser(userId: string): Promise<BusinessUser | undefined>;
  getBrand(brandId: string): Promise<BrandProfile | undefined>;
  listBrandsForOrganization(organizationId: string): Promise<readonly BrandProfile[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  getCampaign(campaignId: string): Promise<Campaign | undefined>;
  getKnowledgeRepository(repositoryId: string): Promise<KnowledgeRepository | undefined>;
  listKnowledgeDocumentsForOrganization(
    organizationId: string
  ): Promise<readonly KnowledgeDocument[]>;
  /**
   * Optional — in-memory / simulated stores may auto-provision principal rows
   * so credential-free Integration OS can resolve context (M10.5).
   */
  ensurePrincipal?(input: {
    organizationId: string;
    userId: string;
    organizationName?: string;
    email?: string;
    displayName?: string;
  }): Promise<void>;
  /**
   * Optional — provision a stub brand row for a known brandId (e.g. Mongo product
   * brand referenced while Execution Context stores are still in-memory).
   */
  ensureBrand?(input: {
    organizationId: string;
    brandId: string;
    userId?: string;
    name?: string;
  }): Promise<void>;
}

export class InMemoryExecutionContextStores implements IExecutionContextStores {
  constructor(
    private readonly data: {
      organizations?: Map<string, Organization>;
      users?: Map<string, BusinessUser>;
      brands?: Map<string, BrandProfile>;
      projects?: Map<string, Project>;
      campaigns?: Map<string, Campaign>;
      knowledgeRepos?: Map<string, KnowledgeRepository>;
      knowledgeDocs?: Map<string, KnowledgeDocument>;
    } = {}
  ) {
    this.data.organizations = this.data.organizations ?? new Map();
    this.data.users = this.data.users ?? new Map();
    this.data.brands = this.data.brands ?? new Map();
  }

  async ensurePrincipal(input: {
    organizationId: string;
    userId: string;
    organizationName?: string;
    email?: string;
    displayName?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    if (!this.data.organizations!.has(input.organizationId)) {
      this.data.organizations!.set(input.organizationId, {
        organizationId: input.organizationId,
        name: input.organizationName ?? "Organisation",
        ownerUserId: input.userId,
        createdAt: now,
        status: "active",
      });
    }
    if (!this.data.users!.has(input.userId)) {
      this.data.users!.set(input.userId, {
        userId: input.userId,
        organizationId: input.organizationId,
        email: input.email ?? `${input.userId}@local`,
        displayName: input.displayName ?? "User",
        roles: ["owner"],
        createdAt: now,
      });
    }
    const brandId = `brand_${input.organizationId}`;
    if (![...this.data.brands!.values()].some((b) => b.organizationId === input.organizationId)) {
      this.data.brands!.set(brandId, {
        brandId,
        organizationId: input.organizationId,
        name: "Default Brand",
        toneOfVoice: "professional",
        visualIdentity: "clean modern",
        brandRules: ["be concise"],
        colorPalette: ["#111111"],
        typography: ["Inter"],
        logoAssetIds: [],
        brandAssetIds: [],
        brandMemoryRefs: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async ensureBrand(input: {
    organizationId: string;
    brandId: string;
    userId?: string;
    name?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    if (input.userId) {
      await this.ensurePrincipal({
        organizationId: input.organizationId,
        userId: input.userId,
      });
    } else if (!this.data.organizations!.has(input.organizationId)) {
      this.data.organizations!.set(input.organizationId, {
        organizationId: input.organizationId,
        name: "Organisation",
        ownerUserId: "system",
        createdAt: now,
        status: "active",
      });
    }
    if (!this.data.brands!.has(input.brandId)) {
      this.data.brands!.set(input.brandId, {
        brandId: input.brandId,
        organizationId: input.organizationId,
        name: input.name ?? "Brand",
        toneOfVoice: "professional",
        visualIdentity: "clean modern",
        brandRules: ["be concise"],
        colorPalette: ["#111111"],
        typography: ["Inter"],
        logoAssetIds: [],
        brandAssetIds: [],
        brandMemoryRefs: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async getOrganization(organizationId: string): Promise<Organization | undefined> {
    return this.data.organizations?.get(organizationId);
  }

  async getUser(userId: string): Promise<BusinessUser | undefined> {
    return this.data.users?.get(userId);
  }

  async getBrand(brandId: string): Promise<BrandProfile | undefined> {
    return this.data.brands?.get(brandId);
  }

  async listBrandsForOrganization(organizationId: string): Promise<readonly BrandProfile[]> {
    if (!this.data.brands) return [];
    return [...this.data.brands.values()].filter(
      (b) => b.organizationId === organizationId
    );
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.data.projects?.get(projectId);
  }

  async getCampaign(campaignId: string): Promise<Campaign | undefined> {
    return this.data.campaigns?.get(campaignId);
  }

  async getKnowledgeRepository(
    repositoryId: string
  ): Promise<KnowledgeRepository | undefined> {
    return this.data.knowledgeRepos?.get(repositoryId);
  }

  async listKnowledgeDocumentsForOrganization(
    organizationId: string
  ): Promise<readonly KnowledgeDocument[]> {
    if (!this.data.knowledgeDocs) return [];
    return [...this.data.knowledgeDocs.values()].filter(
      (d) => d.organizationId === organizationId
    );
  }
}
