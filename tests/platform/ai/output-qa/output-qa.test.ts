/**
 * Phase 16 — Canonical Output QA tests (post-execution, deterministic).
 */

import {
  applyCdfTransition,
  createArtifact,
  fixturePresentationDesignRoute,
  fixturePresentationDeck,
  fixturePresentationSlideContent,
  fixturePresentationSource,
  fixturePresentationStoryline,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
} from "../../../../src/platform/cdf";
import {
  resolveAction,
  resetActionRegistryForTests,
  listGenerationActionsForService,
} from "../../../../src/platform/ai/action-registry";
import type { ActionDefinition } from "../../../../src/platform/ai/action-registry";
import type {
  ActionExecutionResult,
} from "../../../../src/platform/ai/action-execution";
import {
  assertOutputQAAllowsAdvancement,
  getOutputQAContractVersion,
  validateCanonicalActionOutput,
} from "../../../../src/platform/ai/output-qa";
import {
  getExecutionTrace,
  resetExecutionTracesForTests,
  beginExecutionTrace,
} from "../../../../src/platform/os/observability/execution-trace";
import { fixturePresentationDesignSystem } from "../../../../src/platform/cdf/artifacts/presentation/fixtures";

const ORG = "org_p16";
const PROJ = "proj_p16";

function mustAction(id: string, version = "1.0.0"): ActionDefinition {
  const r = resolveAction(id, version);
  if (!r.ok) throw new Error(`missing action ${id}`);
  return r.action;
}

function okResult(
  action: ActionDefinition,
  result: ActionExecutionResult extends { ok: true; result: infer R } ? R : never,
  meta: Record<string, unknown> = {},
): ActionExecutionResult {
  return {
    ok: true,
    actionId: action.actionId,
    actionVersion: action.version,
    executionMode: action.executionMode,
    sideEffectLevel: action.sideEffectLevel,
    dryRun: false,
    executionId: "exec_p16",
    correlationId: "corr_p16",
    result,
    metadata: meta,
  };
}

function failResult(action: ActionDefinition): ActionExecutionResult {
  return {
    ok: false,
    actionId: action.actionId,
    actionVersion: action.version,
    executionMode: action.executionMode,
    code: "EXECUTION_FAILED",
    message: "boom",
    dryRun: false,
    executionId: "exec_p16_fail",
  };
}

describe("Phase 16 Canonical Output QA", () => {
  beforeEach(() => {
    resetActionRegistryForTests();
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetExecutionTracesForTests();
  });

  it("1 — contract version", () => {
    expect(getOutputQAContractVersion()).toBe("16.0.0");
  });

  it("2 — missing generation output (failed execution)", () => {
    const action = mustAction("cdf.phase.presentation.storyline.generate");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: failResult(action),
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.mayAdvance).toBe(false);
    expect(qa.diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(["OUTPUT_MISSING", "EXECUTION_FAILED"]),
    );
  });

  it("3 — output kind mismatch", () => {
    const action = mustAction("cdf.phase.presentation.storyline.generate");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "selection",
        value: {},
      }),
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "OUTPUT_KIND_MISMATCH")).toBe(
      true,
    );
  });

  it("4–5 — schema invalid / required field via storyline artifact", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {
          artifact: {
            artifactId: "cdfart_bad",
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            serviceId: "presentation",
            phaseId: "storyline",
          },
          version: {
            artifactId: "cdfart_bad",
            version: 1,
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            schemaVersion: "1",
            data: { title: "missing schema fields" },
          },
        },
      }),
      context: {
        expectedServiceId: "presentation",
        expectedPhaseId: "storyline",
        expectedArtifactKey: "presentation.storyline",
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some(
        (d) =>
          d.code === "OUTPUT_SCHEMA_INVALID" ||
          d.code === "REQUIRED_FIELD_MISSING",
      ),
    ).toBe(true);
  });

  it("6 — unsupported validator (kind none semantic)", () => {
    const action = mustAction("canonical.semantic.versioned_example", "2.0.0");
    // Force none-like: use action as-is (output none)
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "none", value: null }),
    });
    expect(qa.status).toBe("UNSUPPORTED");
    expect(qa.mayAdvance).toBe(false);
    expect(
      assertOutputQAAllowsAdvancement(qa).ok,
    ).toBe(false);
  });

  it("7 — valid ArtifactVersion (storyline fixture)", () => {
    const action = mustAction("artifact.create");
    const data = fixturePresentationStoryline() as unknown as Record<
      string,
      unknown
    >;
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {
          artifact: {
            artifactId: "cdfart_ok_story",
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            serviceId: "presentation",
            phaseId: "storyline",
            schemaVersion: "1",
          },
          version: {
            artifactId: "cdfart_ok_story",
            version: 1,
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            schemaVersion: "1",
            data,
          },
        },
      }),
      context: {
        expectedServiceId: "presentation",
        expectedPhaseId: "storyline",
        expectedArtifactId: "cdfart_ok_story",
        expectedArtifactVersion: 1,
      },
    });
    expect(qa.status).toBe("VALID");
    expect(qa.mayAdvance).toBe(true);
  });

  it("8 — missing ArtifactVersion", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {},
      }),
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "ARTIFACT_NOT_FOUND")).toBe(
      true,
    );
  });

  it("9 — invalid ArtifactVersion number", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_x",
          version: 0,
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some((d) => d.code === "ARTIFACT_VERSION_INVALID"),
    ).toBe(true);
  });

  it("10–11 — artifact identity / version mismatch", () => {
    const action = mustAction("artifact.create");
    const data = fixturePresentationStoryline() as unknown as Record<
      string,
      unknown
    >;
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {
          artifact: { artifactId: "cdfart_a", serviceId: "presentation" },
          version: {
            artifactId: "cdfart_a",
            version: 2,
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            schemaVersion: "1",
            data,
          },
        },
      }),
      context: {
        expectedArtifactId: "cdfart_b",
        expectedArtifactVersion: 1,
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some((d) => d.code === "ARTIFACT_IDENTITY_MISMATCH"),
    ).toBe(true);
    expect(
      qa.diagnostics.some((d) => d.code === "ARTIFACT_VERSION_INVALID"),
    ).toBe(true);
  });

  it("12 — service mismatch", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        expectedServiceId: "presentation",
        providedArtifact: {
          artifactId: "cdfart_svc",
          version: 1,
          serviceId: "packaging",
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "SERVICE_MISMATCH")).toBe(
      true,
    );
  });

  it("13 — phase mismatch", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        expectedPhaseId: "slide-content",
        providedArtifact: {
          artifactId: "cdfart_ph",
          version: 1,
          phaseId: "storyline",
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "PHASE_MISMATCH")).toBe(true);
  });

  it("14 — persistence mismatch (approval.note non-authoritative)", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_note",
          version: 1,
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: false,
        },
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "PERSISTENCE_MISMATCH")).toBe(
      true,
    );
  });

  it("15 — required upstream missing", () => {
    const action = mustAction(
      "cdf.phase.presentation.slide-content.generate",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
      context: { upstreamRequired: true, upstreamPresent: false },
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some((d) => d.code === "REQUIRED_UPSTREAM_MISSING"),
    ).toBe(true);
  });

  it("16 — output contract mismatch (actionId drift)", () => {
    const action = mustAction("cdf.transition.start");
    const other = mustAction("cdf.transition.approve");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: {
        ...okResult(other, {
          kind: "cdf_transition_result",
          value: { session: { sessionId: "s1" } },
          cdfTransition: {
            session: { sessionId: "s1" },
          } as never,
        }),
        actionId: other.actionId,
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some((d) => d.code === "OUTPUT_CONTRACT_MISMATCH"),
    ).toBe(true);
  });

  it("17 — exact version preserved", () => {
    const action = mustAction("artifact.create");
    const data = fixturePresentationStoryline() as unknown as Record<
      string,
      unknown
    >;
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {
          artifact: { artifactId: "cdfart_v5" },
          version: {
            artifactId: "cdfart_v5",
            version: 5,
            artifactKey: "presentation.storyline",
            artifactType: "structured_doc",
            schemaVersion: "1",
            data,
          },
        },
      }),
      context: {
        expectedArtifactId: "cdfart_v5",
        expectedArtifactVersion: 5,
      },
    });
    expect(qa.status).toBe("VALID");
    expect(qa.metadata.artifactVersion).toBe(5);
  });

  it("18 — approval.note not treated as artifact (fromArtifactVersion false)", () => {
    // covered in 14
    expect(true).toBe(true);
  });

  it("19–20 — structured output loss / free-text fallback", () => {
    const action = mustAction(
      "cdf.phase.presentation.slide-content.generate",
    );
    const loss = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
      context: { requireStructuredArtifact: true },
      policy: { requireArtifactPersistence: true },
    });
    expect(loss.status).toBe("INVALID");
    expect(
      loss.diagnostics.some((d) => d.code === "STRUCTURED_OUTPUT_LOSS"),
    ).toBe(true);

    const free = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: { freeTextOnly: true },
        modelRequest: { messages: [] } as never,
      }),
      context: { requireStructuredArtifact: true },
    });
    expect(free.status).toBe("INVALID");
    expect(
      free.diagnostics.some((d) => d.code === "FREE_TEXT_FALLBACK"),
    ).toBe(true);
  });

  it("21 — Presentation source schema", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_src",
          version: 1,
          artifactKey: "presentation.source",
          data: fixturePresentationSource() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("22 — Presentation storyline", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_st",
          version: 1,
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("23 — Presentation slide-content", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_sc",
          version: 1,
          artifactKey: "presentation.slide-content",
          data: fixturePresentationSlideContent() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("24 — Presentation design-routes", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_dr",
          version: 1,
          artifactKey: "presentation.design-route",
          data: fixturePresentationDesignRoute() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("25 — Presentation full-deck", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_dk",
          version: 1,
          artifactKey: "presentation.deck",
          data: fixturePresentationDeck() as unknown as Record<string, unknown>,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("26 — Presentation design-system (refinement-adjacent)", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_ds",
          version: 1,
          artifactKey: "presentation.design-system",
          data: fixturePresentationDesignSystem() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("VALID");
  });

  it("27 — Presentation final / export transition shape", () => {
    const action = mustAction("cdf.transition.final_action");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "export_result",
        value: { session: { sessionId: "cdf_final" } },
        cdfTransition: {
          session: { sessionId: "cdf_final" },
        } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("28 — Packaging output schema via adapter", () => {
    const action = mustAction("artifact.create");
    // If packaging fixture unavailable, UNSUPPORTED/INVALID on bad data is still a check
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_pkg",
          version: 1,
          artifactKey: "packaging.routes",
          data: { not: "valid" },
          fromArtifactVersion: true,
        },
        expectedServiceId: "packaging",
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "OUTPUT_SCHEMA_INVALID")).toBe(
      true,
    );
  });

  it("29 — Social-media output schema via adapter", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_sm",
          version: 1,
          artifactKey: "social-media.routes",
          data: { not: "valid" },
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.diagnostics.some((d) => d.code === "OUTPUT_SCHEMA_INVALID")).toBe(
      true,
    );
  });

  it("30 — Class-D unsupported artifact validation", () => {
    const gens = listGenerationActionsForService("emailers");
    expect(gens.length).toBeGreaterThan(0);
    const hit = gens.find(
      (a) => a.metadata.artifactContinuityComplete === false,
    );
    expect(hit).toBeTruthy();
    if (!hit) return;
    const qa = validateCanonicalActionOutput({
      action: hit,
      executionResult: okResult(hit, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
      policy: { requireArtifactPersistence: true },
    });
    expect(qa.status).toBe("UNSUPPORTED");
    expect(qa.mayAdvance).toBe(false);
    expect(qa.metadata.artifactContinuityComplete).toBe(false);
  });

  it("31–33 — action / version / phase identity preserved", () => {
    const action = mustAction(
      "cdf.phase.presentation.storyline.generate",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
      context: { expectedPhaseId: "storyline", expectedServiceId: "presentation" },
    });
    expect(qa.actionId).toBe(action.actionId);
    expect(qa.actionVersion).toBe(action.version);
    expect(qa.metadata.cdfPhaseId).toBe("storyline");
  });

  it("34–39 — invariants: no prompt/CMR/provider/lookup/ref/conversation", () => {
    const action = mustAction(
      "cdf.phase.presentation.storyline.generate",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
    });
    expect(qa.metadata.promptMutated).toBe(false);
    expect(qa.metadata.cmrMutated).toBe(false);
    expect(qa.metadata.providerCalled).toBe(false);
    expect(qa.metadata.artifactLookupPerformed).toBe(false);
    expect(qa.metadata.referenceResolved).toBe(false);
    expect(qa.metadata.conversationRetrieved).toBe(false);
    expect(qa.metadata.autoRepaired).toBe(false);
  });

  it("40 — INVALID blocks required completion", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: {},
      }),
    });
    expect(qa.status).toBe("INVALID");
    expect(qa.mayAdvance).toBe(false);
    expect(assertOutputQAAllowsAdvancement(qa).ok).toBe(false);
  });

  it("41 — UNSUPPORTED does not silently become VALID", () => {
    const action = mustAction("canonical.semantic.versioned_example", "2.0.0");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "none", value: null }),
      context: { allowUnvalidatedContinuation: false },
    });
    expect(qa.status).toBe("UNSUPPORTED");
    expect(qa.mayAdvance).toBe(false);
    const allowed = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "none", value: null }),
      context: { allowUnvalidatedContinuation: true },
    });
    expect(allowed.status).toBe("UNSUPPORTED");
    expect(allowed.mayAdvance).toBe(true);
  });

  it("42–43 — trace emitted; sensitive fields absent", () => {
    beginExecutionTrace({
      requestId: "req_p16",
      executionId: "exec_p16",
      correlationId: "corr_p16",
    });
    const action = mustAction(
      "cdf.phase.presentation.storyline.generate",
    );
    validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
    });
    const trace = getExecutionTrace("exec_p16");
    expect(trace?.stages.some((s) => s.stage === "output_qa")).toBe(true);
    expect(JSON.stringify(trace)).not.toMatch(/rawPrompt|signedUrl|Bearer /);
  });

  it("44 — existing validator reused (presentation validate path)", () => {
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, { kind: "artifact_version", value: {} }),
      context: {
        providedArtifact: {
          artifactId: "cdfart_reuse",
          version: 1,
          artifactKey: "presentation.storyline",
          data: fixturePresentationStoryline() as unknown as Record<
            string,
            unknown
          >,
          fromArtifactVersion: true,
        },
      },
    });
    expect(qa.checksPerformed).toContain("artifact_schema");
    expect(qa.status).toBe("VALID");
  });

  it("45 — no duplicate schema introduced (contract reuses ActionDefinition.outputContract)", () => {
    const action = mustAction(
      "cdf.phase.presentation.storyline.generate",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: {},
        modelRequest: { messages: [] } as never,
      }),
    });
    expect(qa.outputKind).toBe(action.outputContract.kind);
  });

  it("46 — valid selection", () => {
    const action = mustAction("cdf.transition.select_route");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "selection",
        value: { session: { sessionId: "cdf_sel" } },
        cdfTransition: { session: { sessionId: "cdf_sel" } } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("47 — valid approval", () => {
    const action = mustAction("cdf.transition.approve");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "approval",
        value: { session: { sessionId: "cdf_ap" } },
        cdfTransition: { session: { sessionId: "cdf_ap" } } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("48 — valid configure (design-routes)", () => {
    const action = mustAction(
      "cdf.phase.presentation.design-routes.configure",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "selection",
        value: { session: { sessionId: "cdf_cfg" } },
        cdfTransition: { session: { sessionId: "cdf_cfg" } } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("49 — valid materialize/render shape", () => {
    const action = mustAction("artifact.render");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "render_result",
        value: { fileId: "cdfrndf_1", format: "pdf" },
        renderedFile: {
          fileId: "cdfrndf_1",
          artifactId: "cdfart_r",
          artifactVersion: 1,
        } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("50 — invalid deterministic / transition result", () => {
    const action = mustAction("cdf.transition.start");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "cdf_transition_result",
        value: {},
      }),
    });
    expect(qa.status).toBe("INVALID");
    expect(
      qa.diagnostics.some((d) => d.code === "REQUIRED_FIELD_MISSING"),
    ).toBe(true);
  });

  it("51 — valid generation envelope", () => {
    const action = mustAction(
      "cdf.phase.presentation.storyline.generate",
    );
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "generation_result",
        value: { providerInvoked: false },
        modelRequest: { messages: [] } as never,
      }),
    });
    expect(qa.status).toBe("VALID");
  });

  it("52 — live artifact.create + QA", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "presentation",
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
    });
    if (!started.ok) throw new Error("start");
    const created = createArtifact({
      sessionId: started.value.session.sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: "presentation.storyline",
      artifactType: "structured_doc",
      data: fixturePresentationStoryline() as unknown as Record<string, unknown>,
      requestId: "req_p16_live",
    });
    const action = mustAction("artifact.create");
    const qa = validateCanonicalActionOutput({
      action,
      executionResult: okResult(action, {
        kind: "artifact_version",
        value: created,
      }),
      context: {
        expectedServiceId: "presentation",
        expectedPhaseId: "storyline",
        expectedArtifactId: created.artifact.artifactId,
        expectedArtifactVersion: created.version.version,
      },
    });
    expect(qa.status).toBe("VALID");
  });
});
