/**
 * Business Platform interfaces.
 */

import type { Result } from "../../intelligence/shared/result";
import type {
  Organization,
  Workspace,
  Project,
  BusinessUser,
  Invitation,
  Department,
  Team,
  BrandProfile,
  Campaign,
  Asset,
  KnowledgeRepository,
  KnowledgeDocument,
  PromptTemplate,
  BusinessWorkflow,
  BusinessExecutionRecord,
  ApprovalRequest,
  Comment,
  Assignment,
  ActivityEvent,
  Notification,
  Plan,
  Subscription,
  CreditLedgerEntry,
  Invoice,
  MarketplaceListing,
  BusinessAnalyticsSnapshot,
  AuditLogEntry,
  OrganizationSettings,
  SearchHit,
  CampaignStatus,
  ApprovalStatus,
  BusinessRole,
} from "../contracts";

export interface CreateOrganizationInput {
  readonly name: string;
  readonly ownerEmail: string;
  readonly ownerDisplayName: string;
  /** When set (e.g. align with Enterprise API tenant), uses this id. */
  readonly organizationId?: string;
  readonly ownerUserId?: string;
}

export interface RequestExecutionInput {
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly campaignId?: string;
  readonly brandId?: string;
  readonly workflowId?: string;
  readonly requestedByUserId: string;
  readonly prompt: string;
  /** Bearer token for Enterprise API Gateway — required for AI delegation. */
  readonly gatewayAccessToken: string;
}

export interface IBusinessPlatform {
  // Tenancy
  createOrganization(input: CreateOrganizationInput): Result<Organization>;
  createWorkspace(organizationId: string, name: string): Result<Workspace>;
  createProject(input: {
    organizationId: string;
    workspaceId: string;
    name: string;
    brandId?: string;
  }): Result<Project>;
  createDepartment(organizationId: string, name: string): Result<Department>;
  createTeam(input: {
    organizationId: string;
    name: string;
    departmentId?: string;
    memberUserIds?: readonly string[];
  }): Result<Team>;
  inviteUser(input: {
    organizationId: string;
    email: string;
    roles: readonly BusinessRole[];
    invitedByUserId: string;
  }): Result<Invitation>;
  acceptInvitation(invitationId: string, displayName: string): Result<BusinessUser>;
  getOrganization(organizationId: string): Result<Organization | undefined>;
  listUsers(organizationId: string): Result<readonly BusinessUser[]>;

  // Brands / campaigns / assets
  createBrand(input: Omit<BrandProfile, "brandId" | "createdAt" | "updatedAt">): Result<BrandProfile>;
  getBrand(brandId: string): Result<BrandProfile | undefined>;
  createCampaign(input: Omit<Campaign, "campaignId" | "createdAt" | "updatedAt" | "status"> & { status?: CampaignStatus }): Result<Campaign>;
  updateCampaignStatus(campaignId: string, status: CampaignStatus): Result<Campaign>;
  listCampaigns(organizationId: string): Result<readonly Campaign[]>;
  createAsset(input: Omit<Asset, "assetId" | "createdAt" | "storageKey"> & { storageKey?: string }): Result<Asset>;

  // Knowledge / prompts
  createKnowledgeRepository(input: {
    organizationId: string;
    workspaceId?: string;
    name: string;
  }): Result<KnowledgeRepository>;
  addDocument(input: {
    repositoryId: string;
    organizationId: string;
    title: string;
    kind: KnowledgeDocument["kind"];
    body: string;
    searchKeywords?: readonly string[];
  }): Result<KnowledgeDocument>;
  versionDocument(documentId: string, body: string): Result<KnowledgeDocument>;
  createPromptTemplate(input: Omit<PromptTemplate, "promptId" | "createdAt">): Result<PromptTemplate>;

  // Workflows (business refs only)
  createWorkflow(input: Omit<BusinessWorkflow, "workflowId" | "createdAt" | "updatedAt">): Result<BusinessWorkflow>;

  // Executions via Gateway only
  requestExecution(input: RequestExecutionInput): Promise<Result<BusinessExecutionRecord>>;
  getExecution(businessExecutionId: string): Result<BusinessExecutionRecord | undefined>;
  listExecutions(organizationId: string): Result<readonly BusinessExecutionRecord[]>;

  // Collaboration
  addComment(input: Omit<Comment, "commentId" | "createdAt">): Result<Comment>;
  assign(input: Omit<Assignment, "assignmentId" | "createdAt">): Result<Assignment>;
  requestApproval(input: Omit<ApprovalRequest, "approvalId" | "createdAt" | "status" | "decidedAt">): Result<ApprovalRequest>;
  decideApproval(approvalId: string, status: Exclude<ApprovalStatus, "pending">, note?: string): Result<ApprovalRequest>;
  listActivity(organizationId: string): Result<readonly ActivityEvent[]>;
  notify(input: Omit<Notification, "notificationId" | "createdAt" | "read">): Result<Notification>;

  // Billing
  listPlans(): Result<readonly Plan[]>;
  subscribe(organizationId: string, planId: string): Result<Subscription>;
  getCreditBalance(organizationId: string): Result<number>;
  consumeCredits(organizationId: string, amount: number, reason: string, referenceId?: string): Result<CreditLedgerEntry>;
  createInvoice(organizationId: string, amountUsd: number, periodStart: string, periodEnd: string): Result<Invoice>;

  // Marketplace / templates / automations / integrations
  publishMarketplaceListing(input: Omit<MarketplaceListing, "listingId" | "createdAt" | "published">): Result<MarketplaceListing>;
  listMarketplace(kind?: MarketplaceListing["kind"]): Result<readonly MarketplaceListing[]>;
  createAutomation(input: Omit<import("../contracts").Automation, "automationId" | "createdAt">): Result<import("../contracts").Automation>;
  connectIntegration(organizationId: string, provider: string): Result<import("../contracts").IntegrationConnection>;

  // Analytics / audit / search / settings
  analytics(organizationId: string, workspaceId?: string): Result<BusinessAnalyticsSnapshot>;
  listAudit(organizationId: string): Result<readonly AuditLogEntry[]>;
  search(organizationId: string, query: string): Result<readonly SearchHit[]>;
  updateSettings(organizationId: string, patch: Partial<Omit<OrganizationSettings, "organizationId" | "updatedAt">>): Result<OrganizationSettings>;

  /** Permissions for a user in an organization. */
  permissionsFor(userId: string, organizationId: string): Result<readonly import("../contracts").BusinessPermission[]>;
}
