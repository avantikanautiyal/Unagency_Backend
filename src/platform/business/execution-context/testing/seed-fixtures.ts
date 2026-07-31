/**
 * Execution context test fixtures — NOT for production runtime.
 */

import type { BrandProfile, Campaign } from "../../contracts/content";
import type { Organization, Project, BusinessUser } from "../../contracts/tenancy";
import { InMemoryExecutionContextStores } from "../stores/execution-context-stores";

export function seedExecutionContextFixtures(input: {
  organizationId: string;
  userId: string;
  organizationName?: string;
  userEmail?: string;
  userDisplayName?: string;
  brand?: Partial<BrandProfile> & { brandId: string; name: string };
  project?: Partial<Project> & { projectId: string; name: string };
  campaign?: Partial<Campaign> & { campaignId: string; name: string; objective: string };
}): InMemoryExecutionContextStores {
  const org: Organization = {
    organizationId: input.organizationId,
    name: input.organizationName ?? "Test Organization",
    ownerUserId: input.userId,
    createdAt: new Date().toISOString(),
    status: "active",
  };

  const user: BusinessUser = {
    userId: input.userId,
    organizationId: input.organizationId,
    email: input.userEmail ?? "user@test.local",
    displayName: input.userDisplayName ?? "Test User",
    roles: ["owner"],
    createdAt: new Date().toISOString(),
  };

  const organizations = new Map([[org.organizationId, org]]);
  const users = new Map([[user.userId, user]]);
  const brands = new Map<string, BrandProfile>();
  const projects = new Map<string, Project>();
  const campaigns = new Map<string, Campaign>();

  if (input.brand) {
    const brand: BrandProfile = {
      brandId: input.brand.brandId,
      organizationId: input.organizationId,
      name: input.brand.name,
      toneOfVoice: input.brand.toneOfVoice ?? "professional",
      visualIdentity: input.brand.visualIdentity ?? "clean modern",
      brandRules: input.brand.brandRules ?? ["be concise", "avoid hype"],
      colorPalette: input.brand.colorPalette ?? ["#111111"],
      typography: input.brand.typography ?? ["Inter"],
      logoAssetIds: input.brand.logoAssetIds ?? [],
      brandAssetIds: input.brand.brandAssetIds ?? [],
      brandMemoryRefs: input.brand.brandMemoryRefs ?? [],
      createdAt: input.brand.createdAt ?? new Date().toISOString(),
      updatedAt: input.brand.updatedAt ?? new Date().toISOString(),
      workspaceId: input.brand.workspaceId,
    };
    brands.set(brand.brandId, brand);
  }

  if (input.project) {
    const project: Project = {
      projectId: input.project.projectId,
      organizationId: input.organizationId,
      workspaceId: input.project.workspaceId ?? "ws_default",
      name: input.project.name,
      brandId: input.project.brandId ?? input.brand?.brandId,
      createdAt: input.project.createdAt ?? new Date().toISOString(),
    };
    projects.set(project.projectId, project);
  }

  if (input.campaign) {
    const campaign: Campaign = {
      campaignId: input.campaign.campaignId,
      organizationId: input.organizationId,
      workspaceId: input.campaign.workspaceId ?? "ws_default",
      name: input.campaign.name,
      objective: input.campaign.objective,
      channels: input.campaign.channels ?? ["email"],
      deliverables: input.campaign.deliverables ?? ["launch email"],
      status: input.campaign.status ?? "active",
      analyticsTags: input.campaign.analyticsTags ?? [],
      brandId: input.campaign.brandId ?? input.brand?.brandId,
      projectId: input.campaign.projectId ?? input.project?.projectId,
      createdAt: input.campaign.createdAt ?? new Date().toISOString(),
      updatedAt: input.campaign.updatedAt ?? new Date().toISOString(),
    };
    campaigns.set(campaign.campaignId, campaign);
  }

  return new InMemoryExecutionContextStores({
    organizations,
    users,
    brands,
    projects,
    campaigns,
  });
}
