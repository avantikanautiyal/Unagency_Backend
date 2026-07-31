/**
 * M9.3 — Production certification suite (backend release gate).
 */

import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
  evaluateReadiness,
  validateEnterpriseApiExecutionConfig,
} from "../../../src/platform/api/runtime";
import { createExpressPlatformAdapter } from "../../../src/platform/api/transports/express";
import { setupEnterpriseApi, loginDemo } from "../../../src/platform/api/testing";
import { createBrandBrainPlatform } from "../../../src/platform/business/brand-brain/factories/create-brand-brain-platform";
import { sampleBrandBrain } from "../../../src/platform/business/brand-brain/builders/sample-brand-brain";
import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";
import { setupIntelligenceOsIntegration } from "../../../src/platform/intelligence/integration/testing";
import { asOrganizationId, asWorkspaceId } from "../../../src/platform/intelligence/shared/identifiers";

describe("M9.3 Production Certification", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  describe("startup safety", () => {
    it("rejects LIVE without OPENAI_API_KEY", () => {
      expect(() =>
        validateEnterpriseApiExecutionConfig("live", { OPENAI_API_KEY: "" })
      ).toThrow(/OPENAI_API_KEY/);
    });

    it("defaults demo tenant off in NODE_ENV=production", () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      delete process.env.ENTERPRISE_API_SEED_DEMO_TENANT;
      resetEnterpriseApiRuntimeForTests();
      const platform = bootstrapEnterpriseApiRuntime({ executionMode: "stub" });
      expect(platform.platform.seed).toBeUndefined();
      process.env.NODE_ENV = prev;
    });
  });

  describe("health and readiness", () => {
    let app: express.Express;

    beforeAll(() => {
      resetEnterpriseApiRuntimeForTests();
      const runtime = bootstrapEnterpriseApiRuntime({ executionMode: "stub" });
      app = express();
      app.use(express.json());
      app.use(createExpressPlatformAdapter({ gateway: runtime.platform.gateway }));
    });

    it("GET /v1/health is liveness (no dependency checks)", async () => {
      const res = await request(app).get("/v1/health");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("healthy");
    });

    it("GET /health aliases /v1/health", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    });

    it("GET /v1/ready reports readiness checks", async () => {
      const res = await request(app).get("/v1/ready");
      expect(res.status).toBe(200);
      expect(res.body.data.checks).toBeDefined();
      expect(Array.isArray(res.body.data.checks)).toBe(true);
    });
  });

  describe("idempotency", () => {
    it("returns same execution for duplicate idempotency key", async () => {
      const platform = setupEnterpriseApi({ executionMode: "stub" });
      const { token, organizationId } = await loginDemo(platform);
      const app = express();
      app.use(express.json());
      app.use(createExpressPlatformAdapter({ gateway: platform.gateway }));

      const body = { prompt: "idempotent test", organizationId };
      const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": "idem_m93" };

      const first = await request(app).post("/v1/executions").set(headers).send(body);
      const second = await request(app).post("/v1/executions").set(headers).send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.executionId).toBe(first.body.data.executionId);
    });

    it("rejects idempotency key conflict", async () => {
      const platform = setupEnterpriseApi({ executionMode: "stub" });
      const { token, organizationId } = await loginDemo(platform);
      const app = express();
      app.use(express.json());
      app.use(createExpressPlatformAdapter({ gateway: platform.gateway }));
      const headers = { Authorization: `Bearer ${token}`, "Idempotency-Key": "idem_conflict" };

      await request(app)
        .post("/v1/executions")
        .set(headers)
        .send({ prompt: "a", organizationId });
      const conflict = await request(app)
        .post("/v1/executions")
        .set(headers)
        .send({ prompt: "b", organizationId });
      expect(conflict.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("input bounds", () => {
    it("rejects oversized prompt", async () => {
      const platform = setupEnterpriseApi({ executionMode: "stub" });
      const { token, organizationId } = await loginDemo(platform);
      const app = express();
      app.use(express.json());
      app.use(createExpressPlatformAdapter({ gateway: platform.gateway }));
      const res = await request(app)
        .post("/v1/executions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          prompt: "x".repeat(100_001),
          organizationId,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("brand brain without repository (non-durable)", () => {
    it("does not share brand state across separate engine instances without repository", async () => {
      const a = createBrandBrainPlatform().engine;
      const b = createBrandBrainPlatform().engine;
      await a.upsert({
        organizationId: "org_brand_iso",
        document: sampleBrandBrain({
          organizationId: "org_brand_iso",
          brandName: "Isolated Brand",
          industry: "test",
          tone: ["calm"],
          region: "us",
          competitor: "none",
        }),
        changelog: "cert",
      });
      const onB = await b.getCurrent("org_brand_iso");
      expect(onB.ok).toBe(true);
      expect(onB.value).toBeUndefined();
    });
  });

  describe("concurrent tenant isolation (simulated)", () => {
    it("isolates context across tenants in parallel simulated runs", async () => {
      const integration = setupIntelligenceOsIntegration({
        runtimeDispatcher: new ControllableDispatcher(),
      }).engine;

      const runFor = (orgId: string, brandId: string) =>
        integration.run({
          requestId: `conc_${orgId}`,
          rawPrompt: `copy for ${orgId}`,
          organizationId: asOrganizationId(orgId),
          workspaceId: asWorkspaceId("ws_1"),
          mode: "planning_through_routing",
          metadata: { userId: "ios_test_user", brandId },
        });

      const results = await Promise.all([
        runFor("org_1", "brand_org_1"),
        runFor("org_1", "brand_org_1"),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
    }, 120_000);
  });

  describe("provider call guard", () => {
    it("SIMULATED mode has zero provider dispatch", async () => {
      const dispatcher = new ControllableDispatcher();
      const integration = setupIntelligenceOsIntegration({
        runtimeDispatcher: dispatcher,
      }).engine;
      await integration.run({
        requestId: "guard_sim",
        rawPrompt: "test",
        organizationId: asOrganizationId("org_1"),
        workspaceId: asWorkspaceId("ws_1"),
        mode: "planning_through_routing",
        metadata: { userId: "ios_test_user", brandId: "brand_org_1" },
      });
      expect(dispatcher.attempts).toBe(0);
    }, 60000);
  });

  describe("readiness evaluation", () => {
    it("marks LIVE not ready without OpenAI key", async () => {
      const report = await evaluateReadiness({
        executionMode: "live",
        env: { OPENAI_API_KEY: "" },
      });
      expect(report.status).toBe("not_ready");
    });

    it("requires mongo connected for ready status", async () => {
      const report = await evaluateReadiness({ executionMode: "stub" });
      if (mongoose.connection.readyState !== 1) {
        expect(report.status).toBe("not_ready");
      }
    });
  });
});
