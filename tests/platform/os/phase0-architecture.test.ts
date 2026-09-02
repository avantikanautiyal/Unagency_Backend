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
import { createDirectExecutionPlatform } from "../../../src/platform/direct/create-direct-execution-platform";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import {
  FakeCapabilityRegistry,
  setupNegotiation,
} from "../../../src/platform/providers/negotiation/testing";
import { createEnterpriseApiPlatform } from "../../../src/platform/api/factories/create-enterprise-api-platform";
import {
  bootstrapEnterpriseApiRuntime,
  resetEnterpriseApiRuntimeForTests,
} from "../../../src/platform/api/runtime";

describe("Phase 0 — canonical OS architecture", () => {
  it("declares direct provider spine authority", () => {
    expect(CANONICAL_PRODUCTION_OS_SPINE.authority).toBe("direct_provider");
    expect(CANONICAL_PRODUCTION_OS_SPINE.path).toEqual(
      expect.arrayContaining(["DirectExecutionEngine", "ProviderRuntime"])
    );
  });

  it("marks BrandGuard and SpecGuard as partial until Brand Memory / Job Object feed them", () => {
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "BrandGuard")?.status).toBe(
      "partial"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "SpecGuard")?.status).toBe(
      "partial"
    );
  });

  it("marks refinement, delivery, governance, and evaluation as implemented", () => {
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "RefinementEngine")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "DeliveryService")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "GovernanceEngine")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "EvaluationEngine")?.status).toBe(
      "implemented"
    );
    expect(OS_LAYER_STATUS.find((l) => l.layerId === "Orchestrator")?.status).toBe(
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

  it("Direct execution factory composes with a dispatcher", () => {
    const platform = createDirectExecutionPlatform({
      runtimeDispatcher: new ControllableDispatcher(),
    });
    expect(platform.engine).toBeDefined();
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
    expect(brand?.status).toBe("SKIPPED");
    expect(spec?.status).toBe("SKIPPED");
    expect(decision.checks.find((c) => c.checkId === "evaluation")?.status).toBe(
      "PLACEHOLDER"
    );
    expect(decision.checks.find((c) => c.checkId === "creative_score")?.status).toBe(
      "SKIPPED"
    );
  });

  it("blocks delivery when creative score is below 80", () => {
    const decision = defaultGovernanceEngine.decide({
      evaluationScore: 0.65,
      creativeScoreTotal: 65,
      evaluationPlaceholder: false,
      humanReviewFlag: false,
      providerSuccess: true,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(decision.action).toBe("REJECT");
    expect(decision.blocking).toBe(true);
    expect(decision.reason).toMatch(/below release gate/);
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
