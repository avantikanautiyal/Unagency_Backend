/**
 * M9.2D1 — Live business context bridge tests.
 */

import { Types } from "mongoose";
import {
  createExecutionContextResolver,
  createLiveBusinessContextStores,
} from "../../../src/platform/business/execution-context";
import { createBrandBrainPlatform } from "../../../src/platform/business/brand-brain/factories/create-brand-brain-platform";
import { sampleBrandBrain } from "../../../src/platform/business/brand-brain/builders/sample-brand-brain";
import { createIntelligenceOsIntegrationPlatform } from "../../../src/platform/intelligence/integration/factories/create-intelligence-os-integration-platform";
import { asOrganizationId, asWorkspaceId } from "../../../src/platform/intelligence/shared/identifiers";
import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";

describe("M9.2D1 Live Business Context Bridge", () => {
  const orgA = new Types.ObjectId().toString();
  const orgB = new Types.ObjectId().toString();
  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();
  const projectA = new Types.ObjectId().toString();
  const projectB = new Types.ObjectId().toString();
  const brandA = `brand_${orgA}`;
  const brandB = `brand_${orgB}`;

  async function createLiveHarness() {
    const brandBrain = createBrandBrainPlatform().engine;
    await brandBrain.upsert({
      organizationId: orgA,
      document: sampleBrandBrain({
        organizationId: orgA,
        brandName: "Acme Brand",
        industry: "retail",
        tone: ["professional"],
        region: "us",
        competitor: "RivalCo",
      }),
      changelog: "seed acme",
    });
    await brandBrain.upsert({
      organizationId: orgB,
      document: sampleBrandBrain({
        organizationId: orgB,
        brandName: "Beta Brand",
        industry: "tech",
        tone: ["bold"],
        region: "eu",
        competitor: "Other",
      }),
      changelog: "seed beta",
    });

    const orgs = new Map([
      [
        orgA,
        {
          _id: orgA,
          companyName: "Acme",
          owner: userA,
          status: "active",
          industry: "retail",
        },
      ],
      [
        orgB,
        {
          _id: orgB,
          companyName: "Beta Corp",
          owner: userB,
          status: "active",
          industry: "tech",
        },
      ],
    ]);
    const users = new Map([
      [userA, { _id: userA, email: "ava@acme.test", name: "Ava", role: "customer", isActive: true }],
      [userB, { _id: userB, email: "bob@beta.test", name: "Bob", role: "customer", isActive: true }],
    ]);
    const projects = new Map([
      [
        projectA,
        { _id: projectA, orgId: orgA, title: "Summer Launch", status: "planning", userId: userA },
      ],
      [
        projectB,
        { _id: projectB, orgId: orgB, title: "Winter Drop", status: "planning", userId: userB },
      ],
    ]);

    const stores = createLiveBusinessContextStores({
      brandBrain,
      deps: {
        findUserById: async (id) => users.get(id) ?? null,
        findOrganizationById: async (id) => orgs.get(id) ?? null,
        findOrganizationOwnedByUser: async (uid) => {
          for (const o of orgs.values()) {
            if (String(o.owner) === uid) return o;
          }
          return null;
        },
        findAcceptedTeamOrganization: async () => null,
        findProjectById: async (id) => projects.get(id) ?? null,
      },
    });

    const resolver = createExecutionContextResolver({
      stores,
      brandBrain,
      useLiveBusinessContext: false,
    });

    return { stores, resolver, brandBrain };
  }

  it("resolves Mongo user + organisation without seed fixtures", async () => {
    const { resolver } = await createLiveHarness();
    const result = await resolver.resolve({
      requestId: "d1_user",
      rawPrompt: "Write copy",
      identity: { userId: userA, organizationId: orgA },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.organization.name).toBe("Acme");
    expect(result.value.business.user.email).toBe("ava@acme.test");
  });

  it("resolves live Brand Brain brand for organisation", async () => {
    const { resolver } = await createLiveHarness();
    const result = await resolver.resolve({
      requestId: "d1_brand",
      rawPrompt: "brand copy",
      identity: { userId: userA, organizationId: orgA },
      scope: { brandId: brandA },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.brand?.name).toBe("Acme Brand");
    expect(result.value.brandEnrichment).toBeDefined();
  });

  it("resolves Mongo project and rejects cross-tenant project", async () => {
    const { resolver } = await createLiveHarness();
    const ok = await resolver.resolve({
      requestId: "d1_proj",
      rawPrompt: "x",
      identity: { userId: userA, organizationId: orgA },
      scope: { projectId: projectA },
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.business.project?.name).toBe("Summer Launch");

    const denied = await resolver.resolve({
      requestId: "d1_proj_x",
      rawPrompt: "x",
      identity: { userId: userA, organizationId: orgA },
      scope: { projectId: projectB },
    });
    expect(denied.ok).toBe(false);
  });

  it("rejects cross-tenant brand before Brand Brain enrichment for unauthorized org", async () => {
    const { resolver } = await createLiveHarness();
    const denied = await resolver.resolve({
      requestId: "d1_brand_x",
      rawPrompt: "x",
      identity: { userId: userA, organizationId: orgA },
      scope: { brandId: brandB },
    });
    expect(denied.ok).toBe(false);
  });

  it("does not resolve demo tenant when real Firebase org is provided", async () => {
    const { resolver } = await createLiveHarness();
    const result = await resolver.resolve({
      requestId: "d1_demo",
      rawPrompt: "x",
      identity: { userId: userA, organizationId: orgA },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.business.organization.organizationId).toBe(orgA);
    expect(result.value.business.organization.name).not.toBe("UNAGENCY Demo");
  });

  it("runs Integration OS with live stores and simulated provider (zero OpenAI)", async () => {
    const brandBrain = createBrandBrainPlatform().engine;
    await brandBrain.upsert({
      organizationId: orgA,
      document: sampleBrandBrain({
        organizationId: orgA,
        brandName: "Acme Brand",
        industry: "retail",
        tone: ["professional"],
        region: "us",
        competitor: "RivalCo",
      }),
      changelog: "e2e",
    });

    const stores = createLiveBusinessContextStores({
      brandBrain,
      deps: {
        findUserById: async () => ({
          _id: userA,
          email: "ava@acme.test",
          name: "Ava",
          role: "customer",
          isActive: true,
        }),
        findOrganizationById: async () => ({
          _id: orgA,
          companyName: "Acme",
          owner: userA,
          status: "active",
        }),
        findOrganizationOwnedByUser: async () => ({ _id: orgA }),
        findAcceptedTeamOrganization: async () => null,
        findProjectById: async () => ({
          _id: projectA,
          orgId: orgA,
          title: "Summer Launch",
          status: "planning",
          userId: userA,
        }),
      },
    });

    const dispatcher = new ControllableDispatcher({
      nowIso: () => new Date().toISOString(),
    });
    const { engine } = createIntelligenceOsIntegrationPlatform({
      executionContextStores: stores,
      useLiveBusinessContext: false,
      runtimeDispatcher: dispatcher,
    });

    const result = await engine.run({
      requestId: "d1_ios",
      rawPrompt: "Create campaign copy for Summer Launch using Acme Brand.",
      organizationId: asOrganizationId(orgA),
      workspaceId: asWorkspaceId("ws_default"),
      mode: "planning_through_routing",
      metadata: {
        userId: userA,
        brandId: brandA,
        projectId: projectA,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.artifacts.executionIntelligence).toBeDefined();
    expect(dispatcher.attempts).toBe(0);
  }, 60000);
});
