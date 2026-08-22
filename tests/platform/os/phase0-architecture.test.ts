/**
 * Phase 0 — canonical production OS spine tests.
 */

import {
  CANONICAL_PRODUCTION_OS_SPINE,
  OS_LAYER_STATUS,
  assertProductionComposition,
  createProductionNegotiationPlatform,
  isControllableDispatcher,
  isFakeCapabilityRegistry,
  ProductionCompositionError,
  canTransitionOsLifecycle,
  transitionOsLifecycle,
  OsLifecycleTransitionError,
  defaultGovernanceEngine,
} from "../../../src/platform/os";
import { createIntelligenceOsIntegrationPlatform } from "../../../src/platform/intelligence/integration/factories/create-intelligence-os-integration-platform";
import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";
import {
  FakeCapabilityRegistry,
  setupNegotiation,
} from "../../../src/platform/intelligence/providers/negotiation/testing";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

describe("Phase 0 — canonical OS architecture", () => {
  it("declares one production spine authority: integration_pipeline", () => {
    expect(CANONICAL_PRODUCTION_OS_SPINE.authority).toBe("integration_pipeline");
    expect(CANONICAL_PRODUCTION_OS_SPINE.nonProductionStacks).toEqual(
      expect.arrayContaining([
        "IntelligenceKernel",
        "IntelligenceGateway",
        "IntelligenceOrchestrator",
      ])
    );
  });

  it("marks BriefIntelligence, BrandIntelligence, and KnowledgeIntelligence as implemented", () => {
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "BriefIntelligence")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "BrandIntelligence")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "KnowledgeIntelligence")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "ExecutionIntelligence")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "TaskGraphExecutor")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "SpecGuard")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "BrandGuard")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "EvaluationEngine")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "GovernanceEngine")?.status).toBe(
      "implemented"
    );
  });

  it("production negotiation does not use FakeCapabilityRegistry", () => {
    const platform = createProductionNegotiationPlatform();
    expect(isFakeCapabilityRegistry(platform.capabilityRegistry)).toBe(false);
    expect(platform.capabilityRegistry.exists("text.generate" as never)).toBe(true);
    const testing = setupNegotiation();
    expect(isFakeCapabilityRegistry(testing.capabilityRegistry)).toBe(true);
  });

  it("Integration OS factory uses production negotiation", () => {
    const platform = createIntelligenceOsIntegrationPlatform({
      executionMode: "simulated",
      allowSimulatedDispatcher: true,
    });
    expect(platform.negotiationSource).toBe("production");
    expect(isFakeCapabilityRegistry(platform.capabilityRegistry)).toBe(false);
  });

  it("rejects ControllableDispatcher for LIVE composition", () => {
    expect(() =>
      assertProductionComposition({
        executionMode: "live",
        runtimeDispatcher: new ControllableDispatcher(),
        negotiationSource: "production",
      })
    ).toThrow(ProductionCompositionError);
  });

  it("rejects testing negotiation source", () => {
    expect(() =>
      assertProductionComposition({
        executionMode: "simulated",
        negotiationSource: "testing",
      })
    ).toThrow(/FakeCapabilityRegistry|testing negotiation/);
  });

  it("rejects FakeCapabilityRegistry in composition assert", () => {
    expect(() =>
      assertProductionComposition({
        executionMode: "simulated",
        capabilityRegistry: new FakeCapabilityRegistry(),
        negotiationSource: "production",
      })
    ).toThrow(ProductionCompositionError);
  });

  it("detects ControllableDispatcher marker", () => {
    expect(isControllableDispatcher(new ControllableDispatcher())).toBe(true);
  });

  it("LIVE createEnterpriseApiPlatform without dispatcher fails closed", () => {
    expect(() =>
      createEnterpriseApiPlatform({
        executionMode: "live",
        seedDemoTenant: false,
      })
    ).toThrow(/runtimeDispatcher|ControllableDispatcher/);
  });

  it("SIMULATED enterprise platform still composes", () => {
    resetEnterpriseApiRuntimeForTests();
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    expect(runtime.platform.gateway).toBeDefined();
    expect(runtime.executionMode).toBe("simulated");
    resetEnterpriseApiRuntimeForTests();
  });
});

describe("Phase 0 — lifecycle", () => {
  it("allows valid transitions", () => {
    expect(canTransitionOsLifecycle("RECEIVED", "PLANNING")).toBe(true);
    expect(transitionOsLifecycle("EXECUTING", "EVALUATING")).toBe("EVALUATING");
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionOsLifecycle("COMPLETED", "EXECUTING")).toBe(false);
    expect(() => transitionOsLifecycle("FAILED", "APPROVED")).toThrow(
      OsLifecycleTransitionError
    );
  });
});

describe("Phase 0 — governance honesty", () => {
  it("never marks BrandGuard/SpecGuard as PASS", () => {
    const decision = defaultGovernanceEngine.decide({
      evaluationScore: 0.95,
      evaluationPlaceholder: true,
      humanReviewFlag: false,
      providerSuccess: true,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(decision.action).toBe("CONTINUE_WITH_GAPS");
    const brand = decision.checks.find((c) => c.checkId === "brand_guard");
    const spec = decision.checks.find((c) => c.checkId === "spec_guard");
    expect(brand?.status).toBe("NOT_IMPLEMENTED");
    expect(spec?.status).toBe("NOT_IMPLEMENTED");
    expect(decision.checks.find((c) => c.checkId === "evaluation")?.status).toBe(
      "PLACEHOLDER"
    );
  });

  it("rejects on provider failure", () => {
    const decision = defaultGovernanceEngine.decide({
      evaluationScore: null,
      evaluationPlaceholder: true,
      humanReviewFlag: false,
      providerSuccess: false,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(decision.action).toBe("REJECT");
    expect(decision.blocking).toBe(true);
  });
});
