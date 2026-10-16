/**
 * A refine of a generated visual phase must send the creative being refined
 * to the model (as the continuation subject reference) — not the brief alone.
 *
 * Live defect: refines reached the image model with only the brief, upstream
 * artwork and logo, so the model redrew the same image.
 */

import { applyCdfRefineTargetPrepass } from "../../../src/platform/api/services/apply-cdf-refine-target-prepass";
import {
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

const SESSION = "cdf_refine_target";

function session(
  generatedArtifacts: CdfSessionState["generatedArtifacts"],
): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId: SESSION,
    serviceId: "merchandise",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_refine",
    contractVersion: "2.0.0-m1",
    sessionVersion: 3,
    status: "active",
    brief: "Vastra t-shirt",
    phaseIndex: 2,
    phaseId: "product-mockup",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    generatedArtifacts,
  };
}

const mockupPin = (artifactId: string, generationExecutionId: string) => ({
  artifactId,
  version: 1,
  phaseId: "product-mockup",
  artifactKey: "merchandise.product-mockup",
  role: "generated" as const,
  generationExecutionId,
});

const refineMeta = (extra: Record<string, unknown> = {}) => ({
  cdfSessionId: SESSION,
  cdfServiceId: "merchandise",
  cdfPhaseId: "product-mockup",
  ...extra,
});

describe("CDF refine target prepass", () => {
  beforeEach(() => resetCdfSessionsForTests());

  it("binds the phase's current creative as the refine subject", async () => {
    saveCdfSession(session([mockupPin("cdfart_v1_mockup", "exec_v1")]));
    const out = await applyCdfRefineTargetPrepass(
      refineMeta({ refinePrompt: "make the logo bigger" }),
    );
    expect(out.cdfRefineSource).toBe(true);
    expect(out.cdfContinuationVisualArtifactId).toBe("cdfart_v1_mockup");
    expect(out.cdfContinuationExecutionId).toBe("exec_v1");
    expect(out.cdfGenerationContinuation).toMatchObject({
      visualArtifactId: "cdfart_v1_mockup",
      visualArtifactVersion: 1,
      isDiagnosticRaw: false,
    });
  });

  it("typed MODIFY in chat targets the referenced execution's creative", async () => {
    saveCdfSession(
      session([
        mockupPin("cdfart_a_mockup", "exec_a"),
        mockupPin("cdfart_b_mockup", "exec_b"),
      ]),
    );
    const out = await applyCdfRefineTargetPrepass(
      refineMeta({ conversationalAction: "MODIFY", refineFromExecutionId: "exec_a" }),
    );
    expect(out.cdfContinuationVisualArtifactId).toBe("cdfart_a_mockup");
  });

  it("ambiguous creatives with no named target are left alone", async () => {
    saveCdfSession(
      session([
        mockupPin("cdfart_a_mockup", "exec_a"),
        mockupPin("cdfart_b_mockup", "exec_b"),
      ]),
    );
    const out = await applyCdfRefineTargetPrepass(
      refineMeta({ refinePrompt: "warmer colours" }),
    );
    expect(out.cdfRefineSource).toBeUndefined();
  });

  it("first generation of a phase (no pin yet) is unchanged", async () => {
    saveCdfSession(session([]));
    const out = await applyCdfRefineTargetPrepass(
      refineMeta({ refinePrompt: "make it horizontal" }),
    );
    expect(out.cdfGenerationContinuation).toBeUndefined();
  });

  it("non-refine runs and structured phases are unchanged", async () => {
    saveCdfSession(session([mockupPin("cdfart_v1_mockup", "exec_v1")]));
    const plain = await applyCdfRefineTargetPrepass(refineMeta());
    expect(plain.cdfRefineSource).toBeUndefined();
    const structured = await applyCdfRefineTargetPrepass(
      refineMeta({ cdfPhaseId: "placement", refinePrompt: "move print higher" }),
    );
    expect(structured.cdfRefineSource).toBeUndefined();
  });

  it("explicit client-selected source is respected", async () => {
    saveCdfSession(session([mockupPin("cdfart_v1_mockup", "exec_v1")]));
    const out = await applyCdfRefineTargetPrepass(
      refineMeta({
        refinePrompt: "x",
        cdfRefineSource: true,
        cdfContinuationVisualArtifactId: "cdfart_chosen",
      }),
    );
    expect(out.cdfContinuationVisualArtifactId).toBe("cdfart_chosen");
  });
});
