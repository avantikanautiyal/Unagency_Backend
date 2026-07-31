/**
 * M9.2D1 HTTP E2E — Firebase auth + live business context + simulated Integration OS.
 * No seedExecutionContextFixtures. No OpenAI.
 */

import express from "express";
import { Types } from "mongoose";
import request from "supertest";
import { createEnterpriseApiPlatform } from "../../src/platform/api/factories/create-enterprise-api-platform";
import { createExpressPlatformAdapter } from "../../src/platform/api/transports/express";
import { createLiveBusinessContextStores } from "../../src/platform/business/execution-context/live";
import { createBrandBrainPlatform } from "../../src/platform/business/brand-brain/factories/create-brand-brain-platform";
import { sampleBrandBrain } from "../../src/platform/business/brand-brain/builders/sample-brand-brain";
import { FirebaseAuthenticationAdapter } from "../../src/platform/api/auth/firebase/firebase-authentication-adapter";
import { CompositeAuthenticationService } from "../../src/platform/api/auth/composite-authentication-service";
import { BridgedTenantService } from "../../src/platform/api/tenants/bridged-tenant-service";
import { LegacyUserIdentityResolver } from "../../src/platform/api/auth/firebase/legacy-user-identity-resolver";
import { ControllableDispatcher } from "../../src/platform/intelligence/providers/runtime/testing";
import { createIntelligenceOsIntegrationPlatform } from "../../src/platform/intelligence/integration/factories/create-intelligence-os-integration-platform";
import { IntegrationLayerJobExecutor } from "../../src/platform/infrastructure/execution/workers/job-executors";
import { createDistributedExecutionPlatform } from "../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";

describe("M9.2D1 HTTP live context E2E", () => {
  jest.setTimeout(60_000);

  const orgA = new Types.ObjectId();
  const orgB = new Types.ObjectId();
  const userA = new Types.ObjectId();
  const projectA = new Types.ObjectId();
  const projectB = new Types.ObjectId();
  const brandA = `brand_${orgA.toString()}`;
  const brandB = `brand_${orgB.toString()}`;

  const firebaseToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJodHRwX2FjbWUifQ.sig";

  let app: express.Express;
  let dispatcher: ControllableDispatcher;

  beforeAll(async () => {
    const brandBrain = createBrandBrainPlatform().engine;
    await brandBrain.upsert({
      organizationId: orgA.toString(),
      document: sampleBrandBrain({
        organizationId: orgA.toString(),
        brandName: "Acme Brand",
        industry: "retail",
        tone: ["professional"],
        region: "us",
        competitor: "Rival",
      }),
      changelog: "http e2e",
    });
    await brandBrain.upsert({
      organizationId: orgB.toString(),
      document: sampleBrandBrain({
        organizationId: orgB.toString(),
        brandName: "Beta Brand",
        industry: "tech",
        tone: ["bold"],
        region: "eu",
        competitor: "Other",
      }),
      changelog: "http e2e b",
    });

    const stores = createLiveBusinessContextStores({
      brandBrain,
      deps: {
        findUserById: async (id) => {
          if (id === userA.toString()) {
            return {
              _id: userA,
              email: "ava@acme.test",
              name: "Ava",
              role: "customer",
              isActive: true,
            };
          }
          return null;
        },
        findOrganizationById: async (id) => {
          if (id === orgA.toString()) {
            return {
              _id: orgA,
              companyName: "Acme",
              owner: userA,
              status: "active",
              industry: "retail",
            };
          }
          if (id === orgB.toString()) {
            return {
              _id: orgB,
              companyName: "Beta Corp",
              owner: new Types.ObjectId(),
              status: "active",
            };
          }
          return null;
        },
        findOrganizationOwnedByUser: async (uid) =>
          uid === userA.toString()
            ? { _id: orgA }
            : null,
        findAcceptedTeamOrganization: async () => null,
        findProjectById: async (id) => {
          if (id === projectA.toString()) {
            return {
              _id: projectA,
              orgId: orgA,
              title: "Summer Launch",
              status: "planning",
              userId: userA,
            };
          }
          if (id === projectB.toString()) {
            return {
              _id: projectB,
              orgId: orgB,
              title: "Winter Drop",
              status: "planning",
              userId: new Types.ObjectId(),
            };
          }
          return null;
        },
      },
    });

    dispatcher = new ControllableDispatcher({
      nowIso: () => new Date().toISOString(),
    });

    const integration = createIntelligenceOsIntegrationPlatform({
      executionContextStores: stores,
      useLiveBusinessContext: false,
      runtimeDispatcher: dispatcher,
    });

    const distributed = createDistributedExecutionPlatform({
      useIntegrationLayer: false,
      executor: new IntegrationLayerJobExecutor(integration.engine),
    }).engine;

    const platform = createEnterpriseApiPlatform({
      enableFirebaseBridge: true,
      seedDemoTenant: true,
      useIntegrationLayer: false,
      distributed,
    });

    const auth = platform.auth as CompositeAuthenticationService;
    auth.setFirebaseAdapter(
      new FirebaseAuthenticationAdapter({
        tenants: platform.tenants as BridgedTenantService,
        verifyIdToken: async () =>
          ({
            uid: "http_acme",
            email: "ava@acme.test",
            email_verified: true,
            exp: Math.floor(Date.now() / 1000) + 3600,
          }) as never,
        identityResolver: new LegacyUserIdentityResolver({
          findUserByFirebaseId: async () =>
            ({
              _id: userA,
              firebaseId: "http_acme",
              role: "customer",
              email: "ava@acme.test",
              isActive: true,
            }) as never,
          findOrganizationByOwner: async () => ({
            _id: orgA,
            companyName: "Acme",
          }),
        }),
      })
    );

    app = express();
    app.use(express.json());
    app.use(createExpressPlatformAdapter({ gateway: platform.gateway }));
    (app as express.Express & { __platform?: typeof platform }).__platform =
      platform;
  });

  it("POST /v1/executions with Firebase token uses live Acme context (not demo tenant)", async () => {
    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${firebaseToken}`)
      .send({
        prompt: "Create campaign copy for Summer Launch using Acme Brand.",
        organizationId: orgA.toString(),
        projectId: projectA.toString(),
        metadata: { brandId: brandA },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.organizationId).toBe(orgA.toString());
    expect(res.body.data.organizationId).not.toMatch(/^org_/);
    expect(dispatcher.attempts).toBe(0);

    const executionId = res.body.data.executionId as string;
    const diag = await request(app)
      .get(`/v1/executions/${executionId}/diagnostics`)
      .set("Authorization", `Bearer ${firebaseToken}`);

    expect(diag.status).toBe(200);
    expect(diag.body.data.executionMode === "simulated" || diag.body.data.providerMode).toBeTruthy();
  });

  it("rejects cross-tenant brandId on HTTP execution", async () => {
    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${firebaseToken}`)
      .send({
        prompt: "Steal Beta brand",
        organizationId: orgA.toString(),
        metadata: { brandId: brandB },
      });

    // Context resolution failure surfaces as failed execution or 4xx
    expect([201, 400, 403, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.data.status === "failed" || res.body.data.errorMessage).toBeTruthy();
    }
  });

  it("rejects cross-tenant projectId on HTTP execution", async () => {
    const res = await request(app)
      .post("/v1/executions")
      .set("Authorization", `Bearer ${firebaseToken}`)
      .send({
        prompt: "Steal Beta project",
        organizationId: orgA.toString(),
        projectId: projectB.toString(),
        metadata: { brandId: brandA },
      });

    expect([201, 400, 403, 500]).toContain(res.status);
    if (res.status === 201) {
      expect(res.body.data.status === "failed" || res.body.data.errorMessage).toBeTruthy();
    }
  });

  it("keeps provider calls at zero", () => {
    expect(dispatcher.attempts).toBe(0);
  });
});
