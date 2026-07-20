/**
 * Business Platform Engine — SaaS product layer.
 * AI execution is delegated exclusively through Enterprise API Gateway.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError, AuthorizationError } from "../../intelligence/shared/errors";
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
  BusinessPermission,
  Automation,
  IntegrationConnection,
  Transaction,
} from "../contracts";
import type {
  CreateOrganizationInput,
  IBusinessPlatform,
  RequestExecutionInput,
} from "../interfaces";
import { permissionsForRoles, hasBusinessPermission } from "../organizations/permissions";
import { GatewayExecutionClient } from "../integrations/gateway-execution-client";
import type { IApiGateway } from "../../api/interfaces";

const DEFAULT_PLANS: readonly Plan[] = [
  { planId: "plan_free", tier: "free", name: "Free", monthlyCredits: 100, priceUsd: 0 },
  { planId: "plan_starter", tier: "starter", name: "Starter", monthlyCredits: 1000, priceUsd: 49 },
  { planId: "plan_growth", tier: "growth", name: "Growth", monthlyCredits: 5000, priceUsd: 199 },
  { planId: "plan_enterprise", tier: "enterprise", name: "Enterprise", monthlyCredits: 50000, priceUsd: 999 },
];

export interface BusinessPlatformEngineDeps {
  readonly gateway: IApiGateway;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class BusinessPlatformEngine implements IBusinessPlatform {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly gatewayClient: GatewayExecutionClient;

  private readonly orgs = new Map<string, Organization>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly projects = new Map<string, Project>();
  private readonly departments = new Map<string, Department>();
  private readonly teams = new Map<string, Team>();
  private readonly users = new Map<string, BusinessUser>();
  private readonly invitations = new Map<string, Invitation>();
  private readonly brands = new Map<string, BrandProfile>();
  private readonly campaigns = new Map<string, Campaign>();
  private readonly assets = new Map<string, Asset>();
  private readonly knowledgeRepos = new Map<string, KnowledgeRepository>();
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly prompts = new Map<string, PromptTemplate>();
  private readonly workflows = new Map<string, BusinessWorkflow>();
  private readonly executions = new Map<string, BusinessExecutionRecord>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly comments = new Map<string, Comment>();
  private readonly assignments = new Map<string, Assignment>();
  private readonly activity = new Map<string, ActivityEvent[]>();
  private readonly notifications = new Map<string, Notification>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly credits = new Map<string, CreditLedgerEntry[]>();
  private readonly balances = new Map<string, number>();
  private readonly invoices = new Map<string, Invoice>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly marketplace = new Map<string, MarketplaceListing>();
  private readonly automations = new Map<string, Automation>();
  private readonly integrations = new Map<string, IntegrationConnection>();
  private readonly audits = new Map<string, AuditLogEntry[]>();
  private readonly settings = new Map<string, OrganizationSettings>();

  constructor(deps: BusinessPlatformEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.gatewayClient = new GatewayExecutionClient(deps.gateway, this.createId);
  }

  // ─── Tenancy ───────────────────────────────────────────────────────────

  createOrganization(input: CreateOrganizationInput): Result<Organization> {
    if (!input.name.trim()) return failure(new ValidationError("name required"));
    const organizationId = input.organizationId ?? this.createId("borg");
    const userId = input.ownerUserId ?? this.createId("busr");
    if (this.orgs.has(organizationId)) {
      return failure(new ValidationError("organization already exists"));
    }
    const org: Organization = {
      organizationId,
      name: input.name,
      ownerUserId: userId,
      createdAt: this.nowIso(),
      status: "active",
    };
    const user: BusinessUser = {
      userId,
      organizationId,
      email: input.ownerEmail,
      displayName: input.ownerDisplayName,
      roles: ["owner"],
      createdAt: this.nowIso(),
    };
    this.orgs.set(organizationId, org);
    this.users.set(userId, user);
    this.balances.set(organizationId, 100);
    this.credits.set(organizationId, [
      {
        entryId: this.createId("crd"),
        organizationId,
        delta: 100,
        balanceAfter: 100,
        reason: "signup_bonus",
        createdAt: this.nowIso(),
      },
    ]);
    this.settings.set(organizationId, {
      organizationId,
      timezone: "UTC",
      locale: "en-US",
      features: { campaigns: true, marketplace: true, automations: true },
      updatedAt: this.nowIso(),
    });
    this.audit(organizationId, userId, "organization.create", "organization", organizationId);
    return success(org);
  }

  createWorkspace(organizationId: string, name: string): Result<Workspace> {
    if (!this.orgs.has(organizationId)) return failure(new NotFoundError("organization not found"));
    const workspace: Workspace = {
      workspaceId: this.createId("bws"),
      organizationId,
      name,
      createdAt: this.nowIso(),
    };
    this.workspaces.set(workspace.workspaceId, workspace);
    this.audit(organizationId, "system", "workspace.create", "workspace", workspace.workspaceId);
    return success(workspace);
  }

  createProject(input: {
    organizationId: string;
    workspaceId: string;
    name: string;
    brandId?: string;
  }): Result<Project> {
    const ws = this.workspaces.get(input.workspaceId);
    if (!ws || ws.organizationId !== input.organizationId) {
      return failure(new ValidationError("workspace/organization mismatch"));
    }
    const project: Project = {
      projectId: this.createId("bprj"),
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      name: input.name,
      brandId: input.brandId,
      createdAt: this.nowIso(),
    };
    this.projects.set(project.projectId, project);
    return success(project);
  }

  createDepartment(organizationId: string, name: string): Result<Department> {
    if (!this.orgs.has(organizationId)) return failure(new NotFoundError("organization not found"));
    const department: Department = {
      departmentId: this.createId("bdept"),
      organizationId,
      name,
    };
    this.departments.set(department.departmentId, department);
    return success(department);
  }

  createTeam(input: {
    organizationId: string;
    name: string;
    departmentId?: string;
    memberUserIds?: readonly string[];
  }): Result<Team> {
    if (!this.orgs.has(input.organizationId)) return failure(new NotFoundError("organization not found"));
    const team: Team = {
      teamId: this.createId("bteam"),
      organizationId: input.organizationId,
      departmentId: input.departmentId,
      name: input.name,
      memberUserIds: input.memberUserIds ?? [],
    };
    this.teams.set(team.teamId, team);
    return success(team);
  }

  inviteUser(input: {
    organizationId: string;
    email: string;
    roles: readonly BusinessRole[];
    invitedByUserId: string;
  }): Result<Invitation> {
    if (!this.orgs.has(input.organizationId)) return failure(new NotFoundError("organization not found"));
    const invitation: Invitation = {
      invitationId: this.createId("binv"),
      organizationId: input.organizationId,
      email: input.email,
      roles: input.roles,
      invitedByUserId: input.invitedByUserId,
      status: "pending",
      createdAt: this.nowIso(),
      expiresAt: new Date(this.clockMs() + 7 * 86400_000).toISOString(),
    };
    this.invitations.set(invitation.invitationId, invitation);
    this.pushActivity(input.organizationId, {
      kind: "system",
      actorUserId: input.invitedByUserId,
      message: `Invited ${input.email}`,
    });
    return success(invitation);
  }

  acceptInvitation(invitationId: string, displayName: string): Result<BusinessUser> {
    const inv = this.invitations.get(invitationId);
    if (!inv || inv.status !== "pending") return failure(new NotFoundError("invitation not found"));
    const user: BusinessUser = {
      userId: this.createId("busr"),
      organizationId: inv.organizationId,
      email: inv.email,
      displayName,
      roles: inv.roles,
      createdAt: this.nowIso(),
    };
    this.users.set(user.userId, user);
    this.invitations.set(invitationId, { ...inv, status: "accepted" });
    return success(user);
  }

  getOrganization(organizationId: string): Result<Organization | undefined> {
    return success(this.orgs.get(organizationId));
  }

  listUsers(organizationId: string): Result<readonly BusinessUser[]> {
    return success([...this.users.values()].filter((u) => u.organizationId === organizationId));
  }

  // ─── Brands / campaigns / assets ───────────────────────────────────────

  createBrand(
    input: Omit<BrandProfile, "brandId" | "createdAt" | "updatedAt">
  ): Result<BrandProfile> {
    if (!this.orgs.has(input.organizationId)) return failure(new NotFoundError("organization not found"));
    const brand: BrandProfile = {
      ...input,
      brandId: this.createId("brand"),
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.brands.set(brand.brandId, brand);
    return success(brand);
  }

  getBrand(brandId: string): Result<BrandProfile | undefined> {
    return success(this.brands.get(brandId));
  }

  createCampaign(
    input: Omit<Campaign, "campaignId" | "createdAt" | "updatedAt" | "status"> & {
      status?: CampaignStatus;
    }
  ): Result<Campaign> {
    if (!this.orgs.has(input.organizationId)) return failure(new NotFoundError("organization not found"));
    const campaign: Campaign = {
      ...input,
      campaignId: this.createId("camp"),
      status: input.status ?? "draft",
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.campaigns.set(campaign.campaignId, campaign);
    this.pushActivity(input.organizationId, {
      kind: "campaign_update",
      actorUserId: "system",
      message: `Campaign created: ${campaign.name}`,
      resourceType: "campaign",
      resourceId: campaign.campaignId,
      workspaceId: input.workspaceId,
    });
    return success(campaign);
  }

  updateCampaignStatus(campaignId: string, status: CampaignStatus): Result<Campaign> {
    const c = this.campaigns.get(campaignId);
    if (!c) return failure(new NotFoundError("campaign not found"));
    const updated: Campaign = {
      ...c,
      status,
      updatedAt: this.nowIso(),
      startedAt: status === "active" ? this.nowIso() : c.startedAt,
      completedAt: status === "completed" ? this.nowIso() : c.completedAt,
    };
    this.campaigns.set(campaignId, updated);
    return success(updated);
  }

  listCampaigns(organizationId: string): Result<readonly Campaign[]> {
    return success([...this.campaigns.values()].filter((c) => c.organizationId === organizationId));
  }

  createAsset(
    input: Omit<Asset, "assetId" | "createdAt" | "storageKey"> & { storageKey?: string }
  ): Result<Asset> {
    const asset: Asset = {
      assetId: this.createId("asset"),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey ?? `s3://${input.organizationId}/${this.createId("obj")}`,
      tags: input.tags,
      createdAt: this.nowIso(),
    };
    this.assets.set(asset.assetId, asset);
    return success(asset);
  }

  // ─── Knowledge ─────────────────────────────────────────────────────────

  createKnowledgeRepository(input: {
    organizationId: string;
    workspaceId?: string;
    name: string;
  }): Result<KnowledgeRepository> {
    const repo: KnowledgeRepository = {
      repositoryId: this.createId("krep"),
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
      createdAt: this.nowIso(),
    };
    this.knowledgeRepos.set(repo.repositoryId, repo);
    return success(repo);
  }

  addDocument(input: {
    repositoryId: string;
    organizationId: string;
    title: string;
    kind: KnowledgeDocument["kind"];
    body: string;
    searchKeywords?: readonly string[];
  }): Result<KnowledgeDocument> {
    if (!this.knowledgeRepos.has(input.repositoryId)) {
      return failure(new NotFoundError("repository not found"));
    }
    const doc: KnowledgeDocument = {
      documentId: this.createId("kdoc"),
      repositoryId: input.repositoryId,
      organizationId: input.organizationId,
      title: input.title,
      kind: input.kind,
      body: input.body,
      version: 1,
      searchKeywords: input.searchKeywords ?? [],
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.documents.set(doc.documentId, doc);
    return success(doc);
  }

  versionDocument(documentId: string, body: string): Result<KnowledgeDocument> {
    const doc = this.documents.get(documentId);
    if (!doc) return failure(new NotFoundError("document not found"));
    const next: KnowledgeDocument = {
      ...doc,
      body,
      version: doc.version + 1,
      updatedAt: this.nowIso(),
    };
    this.documents.set(documentId, next);
    return success(next);
  }

  createPromptTemplate(
    input: Omit<PromptTemplate, "promptId" | "createdAt">
  ): Result<PromptTemplate> {
    const prompt: PromptTemplate = {
      ...input,
      promptId: this.createId("prompt"),
      createdAt: this.nowIso(),
    };
    this.prompts.set(prompt.promptId, prompt);
    return success(prompt);
  }

  createWorkflow(
    input: Omit<BusinessWorkflow, "workflowId" | "createdAt" | "updatedAt">
  ): Result<BusinessWorkflow> {
    if (!input.intelligenceWorkflowRef?.trim()) {
      return failure(new ValidationError("intelligenceWorkflowRef required"));
    }
    const wf: BusinessWorkflow = {
      ...input,
      workflowId: this.createId("bwf"),
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.workflows.set(wf.workflowId, wf);
    return success(wf);
  }

  // ─── Executions (Gateway only) ─────────────────────────────────────────

  async requestExecution(
    input: RequestExecutionInput
  ): Promise<Result<BusinessExecutionRecord>> {
    if (!this.orgs.has(input.organizationId)) {
      return failure(new NotFoundError("organization not found"));
    }
    const perms = this.permissionsFor(input.requestedByUserId, input.organizationId);
    if (!perms.ok) return perms;
    if (!hasBusinessPermission(perms.value, "execution:request")) {
      return failure(new AuthorizationError("missing execution:request"));
    }

    const credit = this.consumeCredits(input.organizationId, 1, "execution_request");
    if (!credit.ok) return credit;

    const businessExecutionId = this.createId("bex");
    let record: BusinessExecutionRecord = {
      businessExecutionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      campaignId: input.campaignId,
      brandId: input.brandId,
      workflowId: input.workflowId,
      requestedByUserId: input.requestedByUserId,
      prompt: input.prompt,
      status: "queued",
      experienceRefs: [],
      auditMeta: { via: "enterprise_api_gateway" },
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
    this.executions.set(businessExecutionId, record);

    const gw = await this.gatewayClient.createExecution({
      prompt: input.prompt,
      organizationId: input.organizationId,
      accessToken: input.gatewayAccessToken,
    });

    if (!gw.ok) {
      record = {
        ...record,
        status: "failed",
        auditMeta: { ...record.auditMeta, error: gw.error.message },
        updatedAt: this.nowIso(),
        completedAt: this.nowIso(),
      };
      this.executions.set(businessExecutionId, record);
      this.audit(
        input.organizationId,
        input.requestedByUserId,
        "execution.failed",
        "execution",
        businessExecutionId,
        { error: gw.error.message }
      );
      return success(record);
    }

    const mapped = mapGatewayStatus(gw.value.status);
    record = {
      ...record,
      status: mapped,
      gatewayExecutionId: gw.value.gatewayExecutionId,
      correlationId: gw.value.correlationId,
      cost: gw.value.cost,
      evaluationScore: gw.value.evaluationScore,
      outputs: gw.value.outputs,
      updatedAt: this.nowIso(),
      completedAt: mapped === "succeeded" || mapped === "failed" ? this.nowIso() : undefined,
    };
    this.executions.set(businessExecutionId, record);
    this.pushActivity(input.organizationId, {
      kind: "execution",
      actorUserId: input.requestedByUserId,
      message: `Execution ${mapped}`,
      resourceType: "execution",
      resourceId: businessExecutionId,
      workspaceId: input.workspaceId,
    });
    this.audit(
      input.organizationId,
      input.requestedByUserId,
      "execution.request",
      "execution",
      businessExecutionId,
      { gatewayExecutionId: gw.value.gatewayExecutionId }
    );
    return success(record);
  }

  getExecution(businessExecutionId: string): Result<BusinessExecutionRecord | undefined> {
    return success(this.executions.get(businessExecutionId));
  }

  listExecutions(organizationId: string): Result<readonly BusinessExecutionRecord[]> {
    return success(
      [...this.executions.values()].filter((e) => e.organizationId === organizationId)
    );
  }

  // ─── Collaboration ─────────────────────────────────────────────────────

  addComment(input: Omit<Comment, "commentId" | "createdAt">): Result<Comment> {
    const comment: Comment = {
      ...input,
      commentId: this.createId("cmt"),
      createdAt: this.nowIso(),
    };
    this.comments.set(comment.commentId, comment);
    this.pushActivity(input.organizationId, {
      kind: input.mentionUserIds.length ? "mention" : "comment",
      actorUserId: input.authorUserId,
      message: input.body.slice(0, 120),
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    for (const uid of input.mentionUserIds) {
      this.notify({
        organizationId: input.organizationId,
        userId: uid,
        title: "You were mentioned",
        body: input.body.slice(0, 200),
      });
    }
    return success(comment);
  }

  assign(input: Omit<Assignment, "assignmentId" | "createdAt">): Result<Assignment> {
    const assignment: Assignment = {
      ...input,
      assignmentId: this.createId("asgn"),
      createdAt: this.nowIso(),
    };
    this.assignments.set(assignment.assignmentId, assignment);
    this.pushActivity(input.organizationId, {
      kind: "assignment",
      actorUserId: input.assignedByUserId,
      message: `Assigned to ${input.assigneeUserId}`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    this.notify({
      organizationId: input.organizationId,
      userId: input.assigneeUserId,
      title: "New assignment",
      body: `${input.resourceType}:${input.resourceId}`,
    });
    return success(assignment);
  }

  requestApproval(
    input: Omit<ApprovalRequest, "approvalId" | "createdAt" | "status" | "decidedAt">
  ): Result<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...input,
      approvalId: this.createId("appr"),
      status: "pending",
      createdAt: this.nowIso(),
    };
    this.approvals.set(approval.approvalId, approval);
    this.pushActivity(input.organizationId, {
      kind: "review_request",
      actorUserId: input.requestedByUserId,
      message: `Approval requested for ${input.resourceType}`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
    return success(approval);
  }

  decideApproval(
    approvalId: string,
    status: Exclude<ApprovalStatus, "pending">,
    note?: string
  ): Result<ApprovalRequest> {
    const a = this.approvals.get(approvalId);
    if (!a) return failure(new NotFoundError("approval not found"));
    if (a.status !== "pending") return failure(new ValidationError("already decided"));
    const updated: ApprovalRequest = {
      ...a,
      status,
      note,
      decidedAt: this.nowIso(),
    };
    this.approvals.set(approvalId, updated);
    this.pushActivity(a.organizationId, {
      kind: "approval",
      actorUserId: a.assigneeUserId,
      message: `Approval ${status}`,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
    });
    return success(updated);
  }

  listActivity(organizationId: string): Result<readonly ActivityEvent[]> {
    return success(this.activity.get(organizationId) ?? []);
  }

  notify(input: Omit<Notification, "notificationId" | "createdAt" | "read">): Result<Notification> {
    const n: Notification = {
      ...input,
      notificationId: this.createId("ntf"),
      read: false,
      createdAt: this.nowIso(),
    };
    this.notifications.set(n.notificationId, n);
    return success(n);
  }

  // ─── Billing ───────────────────────────────────────────────────────────

  listPlans(): Result<readonly Plan[]> {
    return success(DEFAULT_PLANS);
  }

  subscribe(organizationId: string, planId: string): Result<Subscription> {
    const plan = DEFAULT_PLANS.find((p) => p.planId === planId);
    if (!plan) return failure(new NotFoundError("plan not found"));
    if (!this.orgs.has(organizationId)) return failure(new NotFoundError("organization not found"));
    const sub: Subscription = {
      subscriptionId: this.createId("sub"),
      organizationId,
      planId,
      status: "active",
      startedAt: this.nowIso(),
      renewsAt: new Date(this.clockMs() + 30 * 86400_000).toISOString(),
    };
    this.subscriptions.set(sub.subscriptionId, sub);
    this.balances.set(organizationId, (this.balances.get(organizationId) ?? 0) + plan.monthlyCredits);
    this.appendCredit(organizationId, plan.monthlyCredits, "subscription_grant", sub.subscriptionId);
    return success(sub);
  }

  getCreditBalance(organizationId: string): Result<number> {
    return success(this.balances.get(organizationId) ?? 0);
  }

  consumeCredits(
    organizationId: string,
    amount: number,
    reason: string,
    referenceId?: string
  ): Result<CreditLedgerEntry> {
    const bal = this.balances.get(organizationId) ?? 0;
    if (amount < 0) return failure(new ValidationError("amount must be >= 0"));
    if (bal < amount) return failure(new ValidationError("insufficient credits"));
    const next = bal - amount;
    this.balances.set(organizationId, next);
    return success(this.appendCredit(organizationId, -amount, reason, referenceId));
  }

  createInvoice(
    organizationId: string,
    amountUsd: number,
    periodStart: string,
    periodEnd: string
  ): Result<Invoice> {
    const invoice: Invoice = {
      invoiceId: this.createId("inv"),
      organizationId,
      amountUsd,
      currency: "USD",
      periodStart,
      periodEnd,
      status: "open",
      createdAt: this.nowIso(),
    };
    this.invoices.set(invoice.invoiceId, invoice);
    const tx: Transaction = {
      transactionId: this.createId("txn"),
      organizationId,
      invoiceId: invoice.invoiceId,
      amountUsd,
      kind: "charge",
      createdAt: this.nowIso(),
      gateway: "none",
    };
    this.transactions.set(tx.transactionId, tx);
    return success(invoice);
  }

  // ─── Marketplace / automations / integrations ──────────────────────────

  publishMarketplaceListing(
    input: Omit<MarketplaceListing, "listingId" | "createdAt" | "published">
  ): Result<MarketplaceListing> {
    const listing: MarketplaceListing = {
      ...input,
      listingId: this.createId("mkt"),
      published: true,
      createdAt: this.nowIso(),
    };
    this.marketplace.set(listing.listingId, listing);
    return success(listing);
  }

  listMarketplace(kind?: MarketplaceListing["kind"]): Result<readonly MarketplaceListing[]> {
    let rows = [...this.marketplace.values()].filter((l) => l.published);
    if (kind) rows = rows.filter((l) => l.kind === kind);
    return success(rows);
  }

  createAutomation(
    input: Omit<Automation, "automationId" | "createdAt">
  ): Result<Automation> {
    const a: Automation = {
      ...input,
      automationId: this.createId("auto"),
      createdAt: this.nowIso(),
    };
    this.automations.set(a.automationId, a);
    return success(a);
  }

  connectIntegration(
    organizationId: string,
    provider: string
  ): Result<IntegrationConnection> {
    const c: IntegrationConnection = {
      integrationId: this.createId("intg"),
      organizationId,
      provider,
      status: "connected",
      createdAt: this.nowIso(),
    };
    this.integrations.set(c.integrationId, c);
    return success(c);
  }

  // ─── Analytics / audit / search / settings ─────────────────────────────

  analytics(
    organizationId: string,
    workspaceId?: string
  ): Result<BusinessAnalyticsSnapshot> {
    const camps = [...this.campaigns.values()].filter(
      (c) =>
        c.organizationId === organizationId &&
        (!workspaceId || c.workspaceId === workspaceId)
    );
    const execs = [...this.executions.values()].filter(
      (e) =>
        e.organizationId === organizationId &&
        (!workspaceId || e.workspaceId === workspaceId)
    );
    const ledger = this.credits.get(organizationId) ?? [];
    const creditsUsed = ledger.filter((e) => e.delta < 0).reduce((s, e) => s + Math.abs(e.delta), 0);
    const spendUsd = execs.reduce((s, e) => s + (e.cost ?? 0), 0);
    return success({
      organizationId,
      workspaceId,
      campaignsActive: camps.filter((c) => c.status === "active").length,
      executionsTotal: execs.length,
      executionsSucceeded: execs.filter((e) => e.status === "succeeded").length,
      creditsUsed,
      spendUsd,
      capturedAt: this.nowIso(),
    });
  }

  listAudit(organizationId: string): Result<readonly AuditLogEntry[]> {
    return success(this.audits.get(organizationId) ?? []);
  }

  search(organizationId: string, query: string): Result<readonly SearchHit[]> {
    const q = query.toLowerCase();
    const hits: SearchHit[] = [];
    for (const c of this.campaigns.values()) {
      if (c.organizationId !== organizationId) continue;
      if (c.name.toLowerCase().includes(q) || c.objective.toLowerCase().includes(q)) {
        hits.push({
          entityType: "campaign",
          entityId: c.campaignId,
          title: c.name,
          snippet: c.objective.slice(0, 80),
          score: 1,
        });
      }
    }
    for (const d of this.documents.values()) {
      if (d.organizationId !== organizationId) continue;
      if (
        d.title.toLowerCase().includes(q) ||
        d.body.toLowerCase().includes(q) ||
        d.searchKeywords.some((k) => k.toLowerCase().includes(q))
      ) {
        hits.push({
          entityType: "document",
          entityId: d.documentId,
          title: d.title,
          snippet: d.body.slice(0, 80),
          score: 0.9,
        });
      }
    }
    for (const b of this.brands.values()) {
      if (b.organizationId !== organizationId) continue;
      if (b.name.toLowerCase().includes(q)) {
        hits.push({
          entityType: "brand",
          entityId: b.brandId,
          title: b.name,
          snippet: b.toneOfVoice.slice(0, 80),
          score: 0.85,
        });
      }
    }
    return success(hits);
  }

  updateSettings(
    organizationId: string,
    patch: Partial<Omit<OrganizationSettings, "organizationId" | "updatedAt">>
  ): Result<OrganizationSettings> {
    const cur = this.settings.get(organizationId);
    if (!cur) return failure(new NotFoundError("settings not found"));
    const next: OrganizationSettings = {
      ...cur,
      ...patch,
      features: patch.features ?? cur.features,
      updatedAt: this.nowIso(),
    };
    this.settings.set(organizationId, next);
    return success(next);
  }

  permissionsFor(
    userId: string,
    organizationId: string
  ): Result<readonly BusinessPermission[]> {
    const user = this.users.get(userId);
    if (!user || user.organizationId !== organizationId) {
      return failure(new NotFoundError("user not in organization"));
    }
    return success(permissionsForRoles(user.roles));
  }

  // ─── helpers ───────────────────────────────────────────────────────────

  private appendCredit(
    organizationId: string,
    delta: number,
    reason: string,
    referenceId?: string
  ): CreditLedgerEntry {
    const balanceAfter = this.balances.get(organizationId) ?? 0;
    const entry: CreditLedgerEntry = {
      entryId: this.createId("crd"),
      organizationId,
      delta,
      balanceAfter,
      reason,
      referenceId,
      createdAt: this.nowIso(),
    };
    const list = this.credits.get(organizationId) ?? [];
    this.credits.set(organizationId, [...list, entry]);
    return entry;
  }

  private audit(
    organizationId: string,
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: AuditLogEntry = {
      auditId: this.createId("aud"),
      organizationId,
      actorUserId,
      action,
      resourceType,
      resourceId,
      at: this.nowIso(),
      metadata,
    };
    const list = this.audits.get(organizationId) ?? [];
    this.audits.set(organizationId, [...list, entry]);
  }

  private pushActivity(
    organizationId: string,
    partial: Omit<ActivityEvent, "activityId" | "organizationId" | "createdAt">
  ): void {
    const event: ActivityEvent = {
      ...partial,
      activityId: this.createId("act"),
      organizationId,
      createdAt: this.nowIso(),
    };
    const list = this.activity.get(organizationId) ?? [];
    this.activity.set(organizationId, [event, ...list]);
  }
}

function mapGatewayStatus(status: string): BusinessExecutionRecord["status"] {
  switch (status) {
    case "succeeded":
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "queued":
      return "queued";
    case "running":
    case "streaming":
      return "running";
    default:
      return "running";
  }
}
