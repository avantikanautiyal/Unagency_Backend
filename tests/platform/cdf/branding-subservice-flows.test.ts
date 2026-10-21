/**
 * Branding sub-service flows — server state machine: scope-driven phase
 * skipping (Brand Naming & Taglines), skipped-dependency satisfaction,
 * stepper statuses and scope-filtered final CTAs.
 */

import {
  applyCdfTransition,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
} from "../../../src/platform/cdf";
import { cdfDependencySatisfied } from "../../../src/platform/cdf/lifecycle/dependency-satisfaction";
import { approveWithCanonicalCompletion } from "./helpers/bind-minimal-generated-for-approve";

const SERVICE = "brand-naming-taglines";

function startWithScope(scopeLabel: string): string {
  const started = applyCdfTransition({
    action: "start",
    serviceId: SERVICE,
    productMode: "ai",
  });
  if (!started.ok) throw new Error("start failed");
  const sessionId = started.value.session.sessionId;
  const briefed = applyCdfTransition({
    sessionId,
    action: "submit_brief",
    brief: "Name and tagline for a D2C oat-milk brand for urban India",
  });
  if (!briefed.ok) throw new Error("brief failed");
  expect(briefed.value.session.phaseId).toBe("scope");
  const config = resolveCdfServiceConfig(SERVICE)!;
  const routeIndex = config.phases[0]!.routes!.findIndex((r) => r.label === scopeLabel);
  const selected = applyCdfTransition({
    sessionId,
    action: "select_route",
    routeIndex,
    routeLabel: scopeLabel,
    routeTitle: scopeLabel,
  });
  if (!selected.ok) throw new Error(`scope select failed: ${JSON.stringify(selected)}`);
  return sessionId;
}

describe("Brand Naming & Taglines — scope-driven flow", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
  });

  it("is registered as its own flow (not the Logo flow)", () => {
    expect(resolveCdfServiceConfig("branding/brand-naming-taglines")?.serviceId).toBe(SERVICE);
    expect(resolveCdfServiceConfig("branding/visual-identity")?.serviceId).toBe("visual-identity");
    expect(resolveCdfServiceConfig("branding/brand-guidelines")?.serviceId).toBe("brand-guidelines");
    expect(resolveCdfServiceConfig("branding")?.serviceId).toBe("logo");
  });

  it("Taglines only: skips naming steps, marks them skipped, and treats them as satisfied", () => {
    const sessionId = startWithScope("Taglines");
    const session = getCdfSession(sessionId)!;
    expect(session.phaseId).toBe("tagline-routes");

    // tagline-routes depends on naming-shortlist, which never runs here.
    expect(
      cdfDependencySatisfied(session, "naming-shortlist", {
        serviceId: SERVICE,
        dependingPhaseId: "tagline-routes",
      }),
    ).toEqual({ ok: true });

    const shown = applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.value.session.phaseId).toBe("tagline-shortlist");
    const config = resolveCdfServiceConfig(SERVICE)!;
    const status = (id: string) =>
      shown.value.ui.phaseProgressStatuses?.[config.phases.findIndex((p) => p.id === id)];
    expect(status("naming-territories")).toBe("skipped");
    expect(status("naming-shortlist")).toBe("skipped");
    expect(status("final")).toBe("upcoming");
  });

  it("Taglines only: approving the tagline shortlist goes straight to Final with one CTA", () => {
    const sessionId = startWithScope("Taglines");
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    expect(getCdfSession(sessionId)!.phaseId).toBe("tagline-shortlist");

    const finalApproved = approveWithCanonicalCompletion(sessionId);
    expect(finalApproved.ok).toBe(true);
    if (!finalApproved.ok) return;
    expect(finalApproved.value.session.phaseId).toBe("final");
    expect(finalApproved.value.ui.finalActions).toEqual(["Download Tagline Pack"]);
  });

  it("Brand Naming only: runs naming steps, then jumps past every tagline step", () => {
    const sessionId = startWithScope("Brand Naming");
    expect(getCdfSession(sessionId)!.phaseId).toBe("naming-territories");
    applyCdfTransition({ sessionId, action: "select_route", routeIndex: 0 });
    expect(getCdfSession(sessionId)!.phaseId).toBe("naming-shortlist");

    const approved = approveWithCanonicalCompletion(sessionId);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.session.phaseId).toBe("final");
    expect(approved.value.ui.finalActions).toEqual(["Download Naming Pack"]);
  });
});
