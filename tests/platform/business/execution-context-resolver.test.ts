/**
 * M9.2C — Execution context resolution tests.
 */

import { createExecutionContextResolver } from "../../../src/platform/business/execution-context";
import { seedExecutionContextFixtures } from "../../../src/platform/business/execution-context/testing/seed-fixtures";
import { createPromptCompiler } from "../../../src/platform/intelligence/prompt-compiler/factories/create-prompt-compiler";
import { createContextIntelligenceEngine } from "../../../src/platform/intelligence/context/factories/create-context-engine";

describe("M9.2C Execution Context Resolver", () => {
  const orgId = "org_m9_2c";
  const userId = "user_m9_2c";
  const brandId = "brand_m9_2c";
  const projectId = "proj_m9_2c";
  const campaignId = "camp_m9_2c";

  function setupResolver() {
    const stores = seedExecutionContextFixtures({
      organizationId: orgId,
      userId,
      organizationName: "Acme Corp",
      userDisplayName: "Ava Admin",
      brand: {
        brandId,
        name: "Acme Brand",
        toneOfVoice: "professional",
        brandRules: ["avoid jargon"],
      },
      project: { projectId, name: "Launch Site", brandId },
      campaign: {
        campaignId,
        name: "Product Launch",
        objective: "Drive product launch awareness",
        brandId,
        projectId,
      },
    });
    return createExecutionContextResolver({ stores });
  }

  it("resolves authenticated tenant organisation context", async () => {
    const resolver = setupResolver();
    const result = await resolver.resolve({
      requestId: "req_org",
      rawPrompt: "Write launch copy",
      identity: { userId, organizationId: orgId },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.organization.organizationId).toBe(orgId);
    expect(result.value.business.organization.name).toBe("Acme Corp");
  });

  it("resolves correct user context", async () => {
    const resolver = setupResolver();
    const result = await resolver.resolve({
      requestId: "req_user",
      rawPrompt: "hello",
      identity: { userId, organizationId: orgId },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.user.userId).toBe(userId);
    expect(result.value.business.user.displayName).toBe("Ava Admin");
  });

  it("resolves tenant brand context", async () => {
    const resolver = setupResolver();
    const result = await resolver.resolve({
      requestId: "req_brand",
      rawPrompt: "brand post",
      identity: { userId, organizationId: orgId },
      scope: { brandId },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.brand?.brandId).toBe(brandId);
    // Brand enrichment requires a Brand Brain document; Phase 2 no longer auto-seeds sampleBrandBrain.
    // Presence of brand on business context is the required guarantee here.
    expect(result.value.business.brand?.name).toBeTruthy();
  });

  it("fails cross-tenant brand access", async () => {
    const orgA = "org_a";
    const orgB = "org_b";
    const organizations = new Map([
      [orgA, { organizationId: orgA, name: "A", ownerUserId: "user_a", createdAt: "", status: "active" as const }],
      [orgB, { organizationId: orgB, name: "B", ownerUserId: "user_b", createdAt: "", status: "active" as const }],
    ]);
    const users = new Map([
      ["user_a", { userId: "user_a", organizationId: orgA, email: "a@x.com", displayName: "A", roles: ["owner" as const], createdAt: "" }],
    ]);
    const brands = new Map([
      [
        "brand_b",
        {
          brandId: "brand_b",
          organizationId: orgB,
          name: "Other Brand",
          toneOfVoice: "bold",
          visualIdentity: "v",
          brandRules: [],
          colorPalette: [],
          typography: [],
          logoAssetIds: [],
          brandAssetIds: [],
          brandMemoryRefs: [],
          createdAt: "",
          updatedAt: "",
        },
      ],
    ]);

    const { InMemoryExecutionContextStores } = await import(
      "../../../src/platform/business/execution-context/stores/execution-context-stores"
    );
    const resolver = createExecutionContextResolver({
      stores: new InMemoryExecutionContextStores({ organizations, users, brands }),
    });

    const result = await resolver.resolve({
      requestId: "req_xtenant",
      rawPrompt: "x",
      identity: { userId: "user_a", organizationId: orgA },
      scope: { brandId: "brand_b" },
    });
    expect(result.ok).toBe(false);
  });

  it("resolves project and campaign context when provided", async () => {
    const resolver = setupResolver();
    const result = await resolver.resolve({
      requestId: "req_scope",
      rawPrompt: "campaign brief",
      identity: { userId, organizationId: orgId },
      scope: { brandId, projectId, campaignId },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.project?.projectId).toBe(projectId);
    expect(result.value.business.campaign?.objective).toContain("launch");
  });

  it("fails cross-tenant project access", async () => {
    const { InMemoryExecutionContextStores } = await import(
      "../../../src/platform/business/execution-context/stores/execution-context-stores"
    );
    const organizations = new Map([
      [orgId, { organizationId: orgId, name: "Acme", ownerUserId: userId, createdAt: "", status: "active" as const }],
    ]);
    const users = new Map([
      [userId, { userId, organizationId: orgId, email: "u@x.com", displayName: "U", roles: ["owner" as const], createdAt: "" }],
    ]);
    const projects = new Map([
      [
        "proj_x",
        {
          projectId: "proj_x",
          organizationId: "org_other",
          workspaceId: "ws",
          name: "Foreign",
          createdAt: "",
        },
      ],
    ]);
    const resolver = createExecutionContextResolver({
      stores: new InMemoryExecutionContextStores({ organizations, users, projects }),
    });
    const result = await resolver.resolve({
      requestId: "req_proj_x",
      rawPrompt: "x",
      identity: { userId, organizationId: orgId },
      scope: { projectId: "proj_x" },
    });
    expect(result.ok).toBe(false);
  });

  it("does not leak mongoose documents into context build request", async () => {
    const resolver = setupResolver();
    const result = await resolver.resolve({
      requestId: "req_plain",
      rawPrompt: "plain",
      identity: { userId, organizationId: orgId },
      scope: { brandId },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value.contextBuildRequest);
    expect(serialized).not.toContain("_doc");
    expect(serialized).not.toContain("$__");
  });

  it("feeds real context into prompt compiler with brand tone", async () => {
    const resolver = setupResolver();
    const resolved = await resolver.resolve({
      requestId: "req_compile",
      rawPrompt: "Write professional email",
      identity: { userId, organizationId: orgId },
      scope: { brandId, campaignId },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const contextEngine = createContextIntelligenceEngine();
    const context = await contextEngine.build(resolved.value.contextBuildRequest);
    expect(context.ok).toBe(true);
    if (!context.ok) return;

    expect(context.value.brand.voice ?? context.value.brand.tone).toBeTruthy();
    expect(context.value.organization.name).toBe("Acme Corp");

    const compiler = createPromptCompiler();
    const compiled = await compiler.compile({
      templateId: "default.capability",
      templateVersion: "1.0.0",
      context: context.value,
      knowledge: {
        snapshotId: "snap_test",
        documents: [],
        sources: [],
        metadata: {},
        capturedAt: new Date().toISOString(),
      },
      variables: { "user.input": JSON.stringify({ message: "Write professional email" }) },
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const promptText = compiled.value.compiled.messages.map((m) => m.content).join("\n");
    expect(promptText.toLowerCase()).toContain("professional");
  });
});

describe("M9.2C simulated Integration OS context path", () => {
  it("runs integration pipeline with real execution context resolver", async () => {
    const { setupIntelligenceOsIntegration, sampleIntegrationRequest } = await import(
      "../../../src/platform/intelligence/integration/testing"
    );
    const { engine } = setupIntelligenceOsIntegration();
    const result = await engine.run(
      sampleIntegrationRequest({ mode: "planning_through_routing", requestId: "m9_2c_e2e" })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.artifacts.executionIntelligence).toBeDefined();
    expect(result.value.stagesCompleted).toContain("execution_intelligence");
  }, 60000);
});
