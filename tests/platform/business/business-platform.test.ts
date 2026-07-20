import {
  setupBusinessPlatform,
  gatewayLogin,
} from "../../../src/platform/business/testing";
import { permissionsForRoles, hasBusinessPermission } from "../../../src/platform/business/organizations/permissions";
import { BusinessExecutionRequestBuilder } from "../../../src/platform/business/builders/business-builders";

describe("UNAGENCY Business Platform", () => {
  it("creates multi-tenant organizations, workspaces, departments, teams", () => {
    const { engine, seed } = setupBusinessPlatform();
    expect(seed).toBeDefined();
    const org = engine.getOrganization(seed!.organizationId);
    expect(org.ok && org.value?.name).toBe("UNAGENCY Demo");

    const ws = engine.createWorkspace(seed!.organizationId, "Marketing");
    expect(ws.ok).toBe(true);
    const dept = engine.createDepartment(seed!.organizationId, "Growth");
    expect(dept.ok).toBe(true);
    const team = engine.createTeam({
      organizationId: seed!.organizationId,
      name: "Campaign Ops",
      departmentId: dept.ok ? dept.value.departmentId : undefined,
      memberUserIds: [seed!.userId],
    });
    expect(team.ok).toBe(true);

    const project = engine.createProject({
      organizationId: seed!.organizationId,
      workspaceId: seed!.workspaceId,
      name: "Q3 Launch",
    });
    expect(project.ok).toBe(true);
  });

  it("manages invitations, roles, and permissions", () => {
    const { engine, seed } = setupBusinessPlatform();
    const inv = engine.inviteUser({
      organizationId: seed!.organizationId,
      email: "creator@agency.com",
      roles: ["contributor"],
      invitedByUserId: seed!.userId,
    });
    expect(inv.ok).toBe(true);
    if (!inv.ok) return;
    const user = engine.acceptInvitation(inv.value.invitationId, "Creator");
    expect(user.ok && user.value.roles).toContain("contributor");

    const perms = engine.permissionsFor(seed!.userId, seed!.organizationId);
    expect(perms.ok && hasBusinessPermission(perms.value, "org:manage")).toBe(true);
    expect(hasBusinessPermission(permissionsForRoles(["viewer"]), "execution:request")).toBe(
      false
    );
  });

  it("supports brand profiles with identity fields", () => {
    const { engine, seed } = setupBusinessPlatform();
    const brand = engine.createBrand({
      organizationId: seed!.organizationId,
      workspaceId: seed!.workspaceId,
      name: "Nova",
      toneOfVoice: "confident, warm",
      visualIdentity: "minimal geometric",
      brandRules: ["no slang", "inclusive language"],
      colorPalette: ["#0A0A0A", "#F5F5F5"],
      typography: ["Editorial Serif", "Sans"],
      logoAssetIds: [],
      brandAssetIds: [],
      brandMemoryRefs: ["mem_brand_1"],
    });
    expect(brand.ok).toBe(true);
    if (!brand.ok) return;
    const got = engine.getBrand(brand.value.brandId);
    expect(got.ok && got.value?.toneOfVoice).toContain("warm");
  });

  it("manages campaign lifecycle", () => {
    const { engine, seed } = setupBusinessPlatform();
    const camp = engine.createCampaign({
      organizationId: seed!.organizationId,
      workspaceId: seed!.workspaceId,
      name: "Summer Drop",
      objective: "Drive launches",
      channels: ["social", "email"],
      deliverables: ["hero video", "email sequence"],
      analyticsTags: ["summer"],
    });
    expect(camp.ok && camp.value.status).toBe("draft");
    if (!camp.ok) return;
    const active = engine.updateCampaignStatus(camp.value.campaignId, "active");
    expect(active.ok && active.value.status).toBe("active");
    const list = engine.listCampaigns(seed!.organizationId);
    expect(list.ok && list.value.length).toBe(1);
  });

  it("stores knowledge documents with versioning and search", () => {
    const { engine, seed } = setupBusinessPlatform();
    const repo = engine.createKnowledgeRepository({
      organizationId: seed!.organizationId,
      name: "Brand Hub",
    });
    expect(repo.ok).toBe(true);
    if (!repo.ok) return;
    const doc = engine.addDocument({
      repositoryId: repo.value.repositoryId,
      organizationId: seed!.organizationId,
      title: "Return Policy",
      kind: "policy",
      body: "Returns within 30 days",
      searchKeywords: ["returns", "policy"],
    });
    expect(doc.ok && doc.value.version).toBe(1);
    if (!doc.ok) return;
    const v2 = engine.versionDocument(doc.value.documentId, "Returns within 45 days");
    expect(v2.ok && v2.value.version).toBe(2);
    const hits = engine.search(seed!.organizationId, "returns");
    expect(hits.ok && hits.value.some((h) => h.entityType === "document")).toBe(true);
  });

  it("references intelligence workflows without replacing them", () => {
    const { engine, seed } = setupBusinessPlatform();
    const wf = engine.createWorkflow({
      organizationId: seed!.organizationId,
      name: "Campaign brief",
      description: "Business wrapper",
      intelligenceWorkflowRef: "intel.wf.campaign_brief",
    });
    expect(wf.ok && wf.value.intelligenceWorkflowRef).toContain("intel.wf");
  });

  it("delegates AI execution only through Enterprise API Gateway", async () => {
    const platform = setupBusinessPlatform();
    const token = await gatewayLogin(platform);
    const { engine, seed } = platform;

    const withoutToken = await engine.requestExecution({
      organizationId: seed!.organizationId,
      requestedByUserId: seed!.userId,
      prompt: "Write a brief",
      gatewayAccessToken: "",
    });
    expect(withoutToken.ok && withoutToken.value.status).toBe("failed");

    const req = BusinessExecutionRequestBuilder.create()
      .withOrganization(seed!.organizationId)
      .withWorkspace(seed!.workspaceId)
      .withUser(seed!.userId)
      .withPrompt("Create a launch brief for summer")
      .withGatewayToken(token)
      .build();

    const exec = await engine.requestExecution(req);
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    expect(exec.value.gatewayExecutionId).toBeTruthy();
    expect(exec.value.auditMeta.via).toBe("enterprise_api_gateway");
    expect(["succeeded", "running", "queued"]).toContain(exec.value.status);

    const history = engine.listExecutions(seed!.organizationId);
    expect(history.ok && history.value.length).toBeGreaterThan(0);
  });

  it("supports collaboration: comments, assignments, approvals, activity", () => {
    const { engine, seed } = setupBusinessPlatform();
    const camp = engine.createCampaign({
      organizationId: seed!.organizationId,
      workspaceId: seed!.workspaceId,
      name: "Collab",
      objective: "x",
      channels: ["web"],
      deliverables: [],
      analyticsTags: [],
    });
    if (!camp.ok) return;

    const comment = engine.addComment({
      organizationId: seed!.organizationId,
      resourceType: "campaign",
      resourceId: camp.value.campaignId,
      authorUserId: seed!.userId,
      body: "Looks good @reviewer",
      mentionUserIds: [seed!.userId],
    });
    expect(comment.ok).toBe(true);

    const asgn = engine.assign({
      organizationId: seed!.organizationId,
      resourceType: "campaign",
      resourceId: camp.value.campaignId,
      assigneeUserId: seed!.userId,
      assignedByUserId: seed!.userId,
    });
    expect(asgn.ok).toBe(true);

    const appr = engine.requestApproval({
      organizationId: seed!.organizationId,
      resourceType: "campaign",
      resourceId: camp.value.campaignId,
      requestedByUserId: seed!.userId,
      assigneeUserId: seed!.userId,
    });
    expect(appr.ok).toBe(true);
    if (!appr.ok) return;
    const decided = engine.decideApproval(appr.value.approvalId, "approved", "LGTM");
    expect(decided.ok && decided.value.status).toBe("approved");

    const feed = engine.listActivity(seed!.organizationId);
    expect(feed.ok && feed.value.length).toBeGreaterThan(0);
  });

  it("supports billing plans, credits, invoices without payment gateway", () => {
    const { engine, seed } = setupBusinessPlatform();
    const plans = engine.listPlans();
    expect(plans.ok && plans.value.length).toBeGreaterThanOrEqual(4);

    const sub = engine.subscribe(seed!.organizationId, "plan_starter");
    expect(sub.ok && sub.value.status).toBe("active");

    const bal = engine.getCreditBalance(seed!.organizationId);
    expect(bal.ok && (bal.value as number) >= 1000).toBe(true);

    const inv = engine.createInvoice(
      seed!.organizationId,
      49,
      "2026-07-01",
      "2026-07-31"
    );
    expect(inv.ok && inv.value.gateway === undefined && inv.value.status).toBe("open");
  });

  it("publishes marketplace templates and automations", () => {
    const { engine, seed } = setupBusinessPlatform();
    const listing = engine.publishMarketplaceListing({
      kind: "campaign_template",
      name: "Product Launch Kit",
      description: "Reusable launch campaign",
      organizationId: seed!.organizationId,
      metadata: { channels: ["social"] },
    });
    expect(listing.ok && listing.value.published).toBe(true);
    const list = engine.listMarketplace("campaign_template");
    expect(list.ok && list.value.length).toBe(1);

    const auto = engine.createAutomation({
      organizationId: seed!.organizationId,
      name: "On brief approved",
      trigger: "approval.approved",
      enabled: true,
    });
    expect(auto.ok).toBe(true);

    const intg = engine.connectIntegration(seed!.organizationId, "slack");
    expect(intg.ok && intg.value.status).toBe("connected");
  });

  it("provides business analytics and audit trails", async () => {
    const platform = setupBusinessPlatform();
    const token = await gatewayLogin(platform);
    const { engine, seed } = platform;
    await engine.requestExecution({
      organizationId: seed!.organizationId,
      requestedByUserId: seed!.userId,
      prompt: "analytics probe",
      gatewayAccessToken: token,
    });
    const snap = engine.analytics(seed!.organizationId);
    expect(snap.ok && snap.value.executionsTotal).toBeGreaterThanOrEqual(1);
    const audit = engine.listAudit(seed!.organizationId);
    expect(audit.ok && audit.value.some((a) => a.action.includes("execution"))).toBe(true);
  });

  it("manages assets, prompts, and settings", () => {
    const { engine, seed } = setupBusinessPlatform();
    const asset = engine.createAsset({
      organizationId: seed!.organizationId,
      name: "logo.svg",
      contentType: "image/svg+xml",
      sizeBytes: 2048,
      tags: ["logo"],
    });
    expect(asset.ok && asset.value.storageKey).toContain(seed!.organizationId);

    const prompt = engine.createPromptTemplate({
      organizationId: seed!.organizationId,
      name: "Brief scaffold",
      body: "Write a brief for {{product}}",
      tags: ["brief"],
    });
    expect(prompt.ok).toBe(true);

    const settings = engine.updateSettings(seed!.organizationId, { timezone: "America/New_York" });
    expect(settings.ok && settings.value.timezone).toBe("America/New_York");
  });
});
