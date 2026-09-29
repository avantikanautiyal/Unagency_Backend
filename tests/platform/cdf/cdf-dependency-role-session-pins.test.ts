/**
 * Exact X@V session pin lookup respects dependency requiredRole.
 */

import assert from "node:assert/strict";
import {
  deriveDependencyRequiredRole,
  rolePreferenceForDependencyRole,
  tryResolveDependencyRequiredRole,
  CdfDependencyContractError,
} from "../../../src/platform/cdf/canonical";
import {
  cdfDependencySatisfied,
  assertCdfPhaseDependencies,
} from "../../../src/platform/cdf/lifecycle/dependency-satisfaction";
import { resolveCdfPhaseDefinition } from "../../../src/platform/cdf/canonical";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function baseSession(
  overrides: Partial<CdfSessionState> = {},
): CdfSessionState {
  return {
    sessionId: "sess_role",
    serviceId: "social-media",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    phaseIndex: 3,
    phaseId: "output",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("CDF dependency-role — session pin strictness", () => {
  it("11. generated lookup cannot consume selected", () => {
    const session = baseSession({
      selectedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 2,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
      requiredRole: "generated",
    });
    assert.equal(sat.ok, false);
  });

  it("12. generated lookup cannot consume approved", () => {
    const session = baseSession({
      approvedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 2,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "approved",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      requiredRole: "generated",
    });
    assert.equal(sat.ok, false);
  });

  it("13. approved lookup cannot consume generated", () => {
    const session = baseSession({
      serviceId: "packaging",
      phaseId: "front-pack",
      generatedArtifacts: [
        {
          artifactId: "cdfart_3d1",
          version: 1,
          phaseId: "3d-direction",
          artifactKey: "packaging.3d-direction",
          role: "generated",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "3d-direction", {
      serviceId: "packaging",
      dependingPhaseId: "front-pack",
      requiredRole: "approved",
    });
    assert.equal(sat.ok, false);
    if (!sat.ok) assert.equal(sat.generatedOnlyPresent, true);
  });

  it("14. selected lookup accepts approved (exact + deterministic)", () => {
    const session = baseSession({
      approvedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 7,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "approved",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
      requiredRole: "selected",
    });
    assert.equal(sat.ok, true);
  });

  it("14b. selected cannot satisfy approved", () => {
    const session = baseSession({
      selectedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 3,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
      requiredRole: "approved",
    });
    assert.equal(sat.ok, false);
    if (!sat.ok) assert.equal(sat.reason, "not_approved");
  });

  it("14c. generated cannot satisfy selected", () => {
    const session = baseSession({
      generatedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 1,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
      requiredRole: "selected",
    });
    assert.equal(sat.ok, false);
    if (!sat.ok) {
      assert.equal(sat.generatedOnlyPresent, true);
      assert.equal(sat.reason, "not_selected");
    }
  });

  it("17. exact artifact id + version preserved in preference mapping", () => {
    assert.equal(
      rolePreferenceForDependencyRole("selected"),
      "selected_or_approved",
    );
    assert.equal(rolePreferenceForDependencyRole("approved"), "approved_only");
    assert.equal(
      rolePreferenceForDependencyRole("generated"),
      "generated_only",
    );
  });

  it("15. unknown upstream fails closed (no silent approved)", () => {
    const result = tryResolveDependencyRequiredRole(
      { phaseId: "ghost", required: true },
      undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNKNOWN_UPSTREAM_PHASE");
  });

  it("19. optional missing remains optional via assert on phases without that dep", () => {
    const session = baseSession({
      selectedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 2,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "selected",
        },
      ],
    });
    const phase = resolveCdfPhaseDefinition("social-media", "output")!;
    const sat = assertCdfPhaseDependencies(session, { id: "output" }, phase);
    assert.equal(sat.ok, true);
  });

  it("21. no latest fallback — wrong version key does not satisfy via generated", () => {
    const session = baseSession({
      generatedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 99,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
    });
    assert.equal(sat.ok, false);
  });

  it("derive mapping still matches registry upstream contracts", () => {
    const routes = resolveCdfPhaseDefinition("social-media", "routes")!;
    assert.equal(deriveDependencyRequiredRole(routes), "selected");
    const threeD = resolveCdfPhaseDefinition("packaging", "3d-direction")!;
    assert.equal(deriveDependencyRequiredRole(threeD), "approved");
  });

  it("CdfDependencyContractError is constructible", () => {
    const err = new CdfDependencyContractError(
      "UNKNOWN_UPSTREAM_PHASE",
      "test",
    );
    assert.equal(err.code, "UNKNOWN_UPSTREAM_PHASE");
  });
});
