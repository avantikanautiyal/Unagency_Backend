/**
 * Framework-wide CDF dependency / lineage satisfaction (not service-specific).
 */

import assert from "node:assert/strict";
import {
  assertCdfPhaseDependencies,
  cdfDependencySatisfied,
  selectRequiresExactArtifactIdentity,
  sessionHasCanonicalArtifactRefs,
} from "../../../src/platform/cdf/lifecycle/dependency-satisfaction";
import { resolveCdfPhaseDefinition } from "../../../src/platform/cdf/canonical";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function baseSession(
  overrides: Partial<CdfSessionState> = {},
): CdfSessionState {
  return {
    sessionId: "sess_test",
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

describe("CDF lifecycle dependency satisfaction (framework)", () => {
  it("generated-only does not satisfy selected dependency (routes → output)", () => {
    const session = baseSession({
      generatedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 2,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    assert.equal(sessionHasCanonicalArtifactRefs(session), true);
    const sat = cdfDependencySatisfied(session, "routes", {
      serviceId: "social-media",
      dependingPhaseId: "output",
      requiredRole: "selected",
    });
    assert.equal(sat.ok, false);
    if (!sat.ok) {
      assert.equal(sat.generatedOnlyPresent, true);
      assert.equal(sat.requiredRole, "selected");
    }
  });

  it("selected pin satisfies selected dependency", () => {
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
      requiredRole: "selected",
    });
    assert.equal(sat.ok, true);
  });

  it("selected does not satisfy approved dependency (packaging)", () => {
    const session = baseSession({
      serviceId: "packaging",
      phaseId: "front-pack",
      selectedArtifacts: [
        {
          artifactId: "cdfart_3d1",
          version: 1,
          phaseId: "3d-direction",
          artifactKey: "packaging.3d-direction",
          role: "selected",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "3d-direction", {
      serviceId: "packaging",
      dependingPhaseId: "front-pack",
      requiredRole: "approved",
    });
    assert.equal(sat.ok, false);
    if (!sat.ok) assert.equal(sat.reason, "not_approved");
  });

  it("approved pin satisfies approved dependency", () => {
    const session = baseSession({
      serviceId: "packaging",
      phaseId: "front-pack",
      approvedArtifacts: [
        {
          artifactId: "cdfart_3d1",
          version: 1,
          phaseId: "3d-direction",
          artifactKey: "packaging.3d-direction",
          role: "approved",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "3d-direction", {
      serviceId: "packaging",
      dependingPhaseId: "front-pack",
      requiredRole: "approved",
    });
    assert.equal(sat.ok, true);
  });

  it("assertCdfPhaseDependencies fails closed for output without selected routes", () => {
    const session = baseSession({
      generatedArtifacts: [
        {
          artifactId: "cdfart_routes1",
          version: 2,
          phaseId: "routes",
          artifactKey: "social-media.routes",
          role: "generated",
        },
      ],
    });
    const phase = resolveCdfPhaseDefinition("social-media", "output")!;
    const sat = assertCdfPhaseDependencies(
      session,
      { id: "output" },
      phase,
    );
    assert.equal(sat.ok, false);
  });

  it("selectRequiresExactArtifactIdentity when canonical refs exist", () => {
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
    const routes = resolveCdfPhaseDefinition("social-media", "routes");
    assert.equal(selectRequiresExactArtifactIdentity(session, routes), true);
    assert.equal(
      selectRequiresExactArtifactIdentity(baseSession(), routes),
      false,
    );
  });

  it("logo territories → logo-options uses selected role (generic)", () => {
    const session = baseSession({
      serviceId: "logo",
      phaseId: "logo-options",
      selectedArtifacts: [
        {
          artifactId: "cdfart_terr1",
          version: 1,
          phaseId: "territories",
          artifactKey: "logo.territories",
          role: "selected",
        },
      ],
    });
    const sat = cdfDependencySatisfied(session, "territories", {
      serviceId: "logo",
      dependingPhaseId: "logo-options",
    });
    assert.equal(sat.ok, true);
  });
});
