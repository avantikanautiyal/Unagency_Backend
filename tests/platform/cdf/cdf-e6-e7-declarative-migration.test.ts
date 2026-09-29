/**
 * E6/E7 — declarative selection materialize + product-selection auto-advance.
 * No serviceId/phaseId semantic branches in the runtime under test.
 */

import assert from "node:assert/strict";
import {
  resolveCdfPhaseExecutionContract,
  resolveCdfCanonicalService,
} from "../../../src/platform/cdf/canonical";
import { resolveCdfPostBriefStart } from "../../../src/platform/cdf/brief-start";
import { resolveCdfServiceConfig } from "../../../src/platform/cdf/service-configs";
import { materializeDerivedArtifactOnSelect } from "../../../src/platform/cdf/selection/materialize-derived-on-select";
import {
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf/session-store";
import { resetCdfArtifactEngineForTests } from "../../../src/platform/cdf/artifacts";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

describe("E6 declarative materializeDerivedOnSelect", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("design-routes declares materialize by targetArtifactKey (not phase-ID runtime)", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "design-routes",
    });
    assert.ok(contract);
    assert.equal(
      contract!.materializeDerivedOnSelect?.targetArtifactKey,
      "presentation.design-system",
    );
  });

  it("select phase also declares the same targetArtifactKey", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "select",
    });
    assert.ok(contract);
    assert.equal(
      contract!.materializeDerivedOnSelect?.targetArtifactKey,
      "presentation.design-system",
    );
  });

  it("materializer dispatches by artifactKey and produces design-system X@V", () => {
    const ts = new Date().toISOString();
    const sessionId = `cdf_mat_${Date.now().toString(36)}`;
    const session: CdfSessionState = {
      sessionId,
      serviceId: "presentation",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mat",
      contractVersion: "2.0.0-m1",
      sessionVersion: 1,
      status: "active",
      brief: "Pitch",
      phaseIndex: 3,
      phaseId: "design-routes",
      approved: [],
      selected: [],
      masters: {},
      modeOwnership: "ai",
      productMode: "ai",
      createdAt: ts,
      updatedAt: ts,
    };
    saveCdfSession(session);

    const result = materializeDerivedArtifactOnSelect({
      targetArtifactKey: "presentation.design-system",
      session,
      phaseId: "design-routes",
      routeIndex: 0,
      routeTitle: "Clean Minimal",
      routeDesc: "White space",
      routeLabel: "Route 1",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mat",
    });

    assert.ok(result.derivedArtifactId.startsWith("cdfart_"));
    assert.equal(result.derivedArtifactKey, "presentation.design-system");
    assert.ok(result.derivedArtifactVersion >= 1);
    assert.ok(
      (result.session.selectedArtifacts ?? []).some(
        (r) => r.artifactKey === "presentation.design-system",
      ),
    );
  });

  it("unknown targetArtifactKey fails closed", () => {
    const ts = new Date().toISOString();
    const session: CdfSessionState = {
      sessionId: "cdf_mat_unknown",
      serviceId: "presentation",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      sessionVersion: 1,
      status: "active",
      brief: "x",
      phaseIndex: 0,
      phaseId: "x",
      approved: [],
      selected: [],
      masters: {},
      modeOwnership: "ai",
      productMode: "ai",
      createdAt: ts,
      updatedAt: ts,
    };
    assert.throws(
      () =>
        materializeDerivedArtifactOnSelect({
          targetArtifactKey: "unknown.derived-key",
          session,
          phaseId: "x",
          routeIndex: 0,
          routeTitle: "T",
        }),
      /No derived-artifact materializer/,
    );
  });
});

describe("E7 declarative productSelectionAutoAdvance", () => {
  it("social-media platform/size declare policies — runtime walks policies not IDs", () => {
    const svc = resolveCdfCanonicalService("social-media");
    assert.ok(svc);
    const platform = svc!.phases.find((p) => p.phaseId === "platform");
    const size = svc!.phases.find((p) => p.phaseId === "size-reference");
    assert.equal(platform?.productSelectionAutoAdvance?.hint, "platform");
    assert.equal(
      platform?.productSelectionAutoAdvance?.routeResolution,
      "match_hint_label",
    );
    assert.equal(size?.productSelectionAutoAdvance?.hint, "format");
    assert.equal(
      size?.productSelectionAutoAdvance?.routeResolution,
      "prefer_label_pattern",
    );
  });

  it("brief-start auto-advances any leading phases with matching hints", () => {
    const config = resolveCdfServiceConfig("social-media");
    assert.ok(config);
    const start = resolveCdfPostBriefStart({
      config: config!,
      selection: { platform: "Instagram", format: "Feed Post" },
    });
    assert.equal(start.autoApproved.length, 2);
    assert.equal(start.autoApproved[0]?.phaseId, "platform");
    assert.equal(start.autoApproved[1]?.phaseId, "size-reference");
    assert.equal(start.phaseIndex, 2);
    assert.equal(start.phase?.id, "routes");
  });

  it("brief-start stops when hint missing — does not hardcode social-media", () => {
    const config = resolveCdfServiceConfig("social-media");
    const start = resolveCdfPostBriefStart({
      config: config!,
      selection: {},
    });
    assert.equal(start.autoApproved.length, 0);
    assert.equal(start.phaseIndex, 0);
  });

  it("presentation has no productSelectionAutoAdvance — brief-start is a no-op", () => {
    const config = resolveCdfServiceConfig("presentation");
    assert.ok(config);
    const start = resolveCdfPostBriefStart({
      config: config!,
      selection: { platform: "Instagram", format: "Feed" },
    });
    assert.equal(start.autoApproved.length, 0);
    assert.equal(start.phaseIndex, 0);
  });
});
