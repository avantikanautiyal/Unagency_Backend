/**
 * Social Media CDF output — stop route_visual / direct_routes_* fork + quality gate.
 */

import {
  applyCdfTransition,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
} from "../../../src/platform/cdf";
import {
  stampExecutionReleaseGate,
  resetExecutionReleaseGateForTests,
} from "../../../src/platform/cdf/social-media-runtime/execution-release-gate";
import { applyVisualModificationPrepass } from "../../../src/platform/api/services/apply-visual-modification-prepass";
import { runCreatePrepass } from "../../../src/platform/api/services/execution-create-prepass";
import type { ExecutionCreateHost } from "../../../src/platform/api/services/execution-create-host";
import type { AuthPrincipal } from "../../../src/platform/api/contracts";
import { saveCdfSession } from "../../../src/platform/cdf/session-store";

function stubHost(): ExecutionCreateHost {
  return {
    deps: {
      nowIso: () => new Date().toISOString(),
      clockMs: () => Date.now(),
      createId: (p: string) => `${p}_test`,
    },
  } as unknown as ExecutionCreateHost;
}

const principal = {
  userId: "user_sm_out",
  organizationId: "org_sm_out",
} as AuthPrincipal;

describe("Social Media CDF output path guards", () => {
  const prevQa = process.env.CREATIVE_QA;

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetExecutionReleaseGateForTests();
  });

  afterAll(() => {
    if (prevQa === undefined) delete process.env.CREATIVE_QA;
    else process.env.CREATIVE_QA = prevQa;
  });

  it("prepass rejects route_visual for canonical CDF phase (Social Media output)", async () => {
    const result = await runCreatePrepass(
      stubHost(),
      {
        prompt: "Generate social creative",
        organizationId: "org_sm_out",
        capabilityId: "image.generate",
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "output",
          cdfPhaseType: "output",
          cdfArtifactKey: "social-media.output",
          cdfExecutionStrategy: "canonical",
          productAction: "route_visual",
        },
      },
      principal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(String(result.error.message)).toMatch(/route_visual|canonical/i);
  });

  it("prepass rejects route_visual for another canonical image phase (packaging front-pack)", async () => {
    const result = await runCreatePrepass(
      stubHost(),
      {
        prompt: "Generate front pack",
        organizationId: "org_sm_out",
        capabilityId: "image.generate",
        metadata: {
          cdfServiceId: "packaging",
          cdfPhaseId: "front-pack",
          cdfArtifactKey: "packaging.front-pack",
          cdfExecutionStrategy: "canonical",
          productAction: "route_visual",
        },
      },
      principal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(String(result.error.message)).toMatch(/route_visual|canonical/i);
  });

  it("prepass strips direct_routes_* parent for Social Media CDF output", async () => {
    const result = await runCreatePrepass(
      stubHost(),
      {
        prompt: "Generate social creative",
        organizationId: "org_sm_out",
        capabilityId: "image.generate",
        metadata: {
          cdfServiceId: "social-media",
          cdfPhaseId: "output",
          productAction: "generate",
          parentExecutionId: "direct_routes_111",
        },
      },
      principal,
    );
    if (!result.ok) {
      expect(String(result.error.message)).not.toMatch(/direct_routes_/i);
      return;
    }
    expect(JSON.stringify(result)).not.toMatch(/direct_routes_111/);
  });

  it("rejects approve targeting direct_routes_* on Social Media output", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_sm_out",
      projectId: "proj_sm_out",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");

    const session = {
      ...started.value.session,
      phaseId: "output",
      phaseIndex: 3,
      sessionVersion: (started.value.session.sessionVersion ?? 0) + 1,
    };
    saveCdfSession(session);

    const approved = applyCdfTransition({
      sessionId: session.sessionId,
      action: "approve",
      executionId: "direct_routes_12345",
      expectedVersion: session.sessionVersion,
    });
    expect(approved.ok).toBe(false);
    if (approved.ok) throw new Error("expected fail");
    expect(String(approved.error.message)).toMatch(/direct_routes_/i);
  });

  it("rejects MODIFY retargeting Social Media output to direct_routes_*", async () => {
    const result = await applyVisualModificationPrepass({
      organizationId: "org_sm_out",
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        conversationalAction: "MODIFY",
        conversationalReferencedExecutionId: "direct_routes_999",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(String(result.error.message)).toMatch(/direct_routes_/i);
  });

  it("blocks Social Media output approve when CREATIVE_QA release gate is blocked", () => {
    process.env.CREATIVE_QA = "on";
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_sm_qa",
      projectId: "proj_sm_qa",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("start");

    const session = {
      ...started.value.session,
      phaseId: "output",
      phaseIndex: 3,
      sessionVersion: (started.value.session.sessionVersion ?? 0) + 1,
    };
    saveCdfSession(session);

    stampExecutionReleaseGate("exec_sm_fail_qa", {
      blocked: true,
      creativeScore: 24,
      reason: "Release blocked — creative score 24/100 (gate 70)",
    });

    const approved = applyCdfTransition({
      sessionId: session.sessionId,
      action: "approve",
      executionId: "exec_sm_fail_qa",
      expectedVersion: session.sessionVersion,
    });
    expect(approved.ok).toBe(false);
    if (approved.ok) throw new Error("expected fail");
    expect(String(approved.error.message)).toMatch(
      /creative QA|release gate|blocked/i,
    );
  });
});
