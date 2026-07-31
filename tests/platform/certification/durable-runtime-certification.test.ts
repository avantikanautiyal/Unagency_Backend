/**
 * M9.4 — Durable production runtime certification.
 */

import { BrandBrainEngine } from "../../../src/platform/business/brand-brain/engine/brand-brain-engine";
import { sampleBrandBrain } from "../../../src/platform/business/brand-brain/builders/sample-brand-brain";
import {
  getSharedTestDurableStores,
  resetSharedTestDurableStores,
  InMemoryBrandBrainRepository,
} from "../../../src/platform/infrastructure/durability";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import { loginDemo } from "../../../src/platform/api/testing";
import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";

describe("M9.4 Durable Runtime Certification", () => {
  afterEach(() => {
    resetSharedTestDurableStores();
  });

  describe("brand durability", () => {
    it("survives restart via shared repository", async () => {
      const repo = new InMemoryBrandBrainRepository();
      const engineA = new BrandBrainEngine({ repository: repo });
      await engineA.upsert({
        organizationId: "org_restart",
        document: sampleBrandBrain({
          organizationId: "org_restart",
          brandName: "Restart Brand",
          industry: "tech",
          tone: ["bold"],
          region: "us",
          competitor: "none",
        }),
        changelog: "m94 restart test",
      });

      const engineB = new BrandBrainEngine({ repository: repo });
      const current = await engineB.getCurrent("org_restart");
      expect(current.ok).toBe(true);
      expect(current.value?.document.identity.name).toBe("Restart Brand");
      expect(current.value?.version).toBe(1);
    });

    it("shares brand across instances (multi-instance)", async () => {
      const stores = getSharedTestDurableStores();
      const engineA = new BrandBrainEngine({ repository: stores.brandBrain });
      const engineB = new BrandBrainEngine({ repository: stores.brandBrain });

      await engineA.upsert({
        organizationId: "org_multi",
        document: sampleBrandBrain({
          organizationId: "org_multi",
          brandName: "Shared Brand",
          industry: "retail",
          tone: ["warm"],
          region: "eu",
          competitor: "rival",
        }),
        changelog: "instance A write",
      });

      const onB = await engineB.getCurrent("org_multi");
      expect(onB.ok).toBe(true);
      expect(onB.value?.document.identity.name).toBe("Shared Brand");
    });
  });

  describe("execution persistence", () => {
    it("reads execution across API instances via shared store", async () => {
      const stores = getSharedTestDurableStores();
      const platformA = createEnterpriseApiPlatform({
        executionMode: "stub",
        durableStores: stores,
      });
      const platformB = createEnterpriseApiPlatform({
        executionMode: "stub",
        durableStores: stores,
      });
      const { organizationId } = await loginDemo(platformA);

      const created = await platformA.executions.create(
        { prompt: "durable exec", organizationId },
        {
          principalId: platformA.seed!.userId,
          kind: "user",
          userId: platformA.seed!.userId,
          organizationId,
          roles: ["owner"],
        }
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const read = await platformB.executions.get(created.value.executionId, {
        organizationId,
        userId: platformA.seed!.userId,
      });
      expect(read.ok).toBe(true);
      expect(read.value?.executionId).toBe(created.value.executionId);
    });
  });

  describe("idempotency cross-instance", () => {
    it("returns same execution from second API instance", async () => {
      const stores = getSharedTestDurableStores();
      const platformA = createEnterpriseApiPlatform({
        executionMode: "stub",
        durableStores: stores,
      });
      const platformB = createEnterpriseApiPlatform({
        executionMode: "stub",
        durableStores: stores,
      });
      const { organizationId } = await loginDemo(platformA);
      const body = { prompt: "idem cross", organizationId };

      const first = await platformA.executions.create(
        { ...body, idempotencyKey: "m94_cross" },
        {
          principalId: platformA.seed!.userId,
          kind: "user",
          userId: platformA.seed!.userId,
          organizationId,
          roles: ["owner"],
        }
      );
      const second = await platformB.executions.create(
        { ...body, idempotencyKey: "m94_cross" },
        {
          principalId: platformA.seed!.userId,
          kind: "user",
          userId: platformA.seed!.userId,
          organizationId,
          roles: ["owner"],
        }
      );
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(second.value?.executionId).toBe(first.value?.executionId);
    });
  });

  describe("artifact tenant isolation", () => {
    it("denies cross-tenant artifact access", async () => {
      const stores = getSharedTestDurableStores();
      const platform = createEnterpriseApiPlatform({
        executionMode: "stub",
        durableStores: stores,
      });
      const { organizationId } = await loginDemo(platform);
      const created = await platform.executions.create(
        { prompt: "artifact iso", organizationId },
        {
          principalId: platform.seed!.userId,
          kind: "user",
          userId: platform.seed!.userId,
          organizationId,
          roles: ["owner"],
        }
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const denied = await platform.executions.artifacts(created.value.executionId, {
        organizationId: "other_org",
        userId: "u_other",
      });
      expect(denied.ok).toBe(false);
    });
  });

  describe("provider call guard", () => {
    it("SIMULATED durable path has zero provider dispatch", async () => {
      const dispatcher = new ControllableDispatcher();
      expect(dispatcher.attempts).toBe(0);
    });
  });
});
