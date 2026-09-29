/**
 * Generation continuation ("Use this creative") — workflow advance ≠ approval.
 * Generic: no service/phase forks in assertions beyond packaging fixture data.
 */

import assert from "node:assert/strict";
import {
  applyCdfTransition,
  compileCanonicalGenerationRequest,
  compileCanonicalModelRequestFromGeneration,
  createArtifact,
  fixturePackaging3dDirection,
  fixturePackagingDieline,
  fixturePackagingRoutes,
  getCdfSession,
  PACKAGING_ARTIFACT_KEYS,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  resolveCdfServiceConfig,
  saveCdfSession,
} from "../../../src/platform/cdf";
import type {
  CdfGenerationContinuationSelection,
  CdfSessionState,
} from "../../../src/platform/cdf/types";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_gen_cont";

function seedUpstream(sessionId: string) {
  const dieline = createArtifact({
    sessionId,
    serviceId: "packaging",
    phaseId: "dieline",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
    artifactType: "config_choice",
    data: fixturePackagingDieline() as never,
  });
  const routes = createArtifact({
    sessionId,
    serviceId: "packaging",
    phaseId: "routes",
    organizationId: ORG,
    projectId: PROJ,
    artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
    artifactType: "text_choice",
    data: fixturePackagingRoutes(
      dieline.artifact.artifactId,
      1,
    ) as never,
  });
  return { dieline, routes };
}

function sessionOn3dDirection(
  sessionId: string,
  dieline: ReturnType<typeof createArtifact>,
  routes: ReturnType<typeof createArtifact>,
  extras?: Partial<CdfSessionState>,
): CdfSessionState {
  const ts = new Date().toISOString();
  const config = resolveCdfServiceConfig("packaging");
  assert.ok(config);
  const phaseIndex = config.phases.findIndex((p) => p.id === "3d-direction");
  assert.equal(phaseIndex, 2);
  return {
    sessionId,
    serviceId: "packaging",
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Generation continuation brief",
    phaseIndex,
    phaseId: "3d-direction",
    approved: [
      {
        phaseId: "dieline",
        approvedAt: ts,
        selectedRouteIndex: 0,
        artifactId: dieline.artifact.artifactId,
        artifactVersion: 1,
      },
      {
        phaseId: "routes",
        approvedAt: ts,
        selectedRouteIndex: 0,
        selectedChoiceId: "route_01",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
      },
    ],
    selected: [
      {
        phaseId: "dieline",
        selectedAt: ts,
        selectedRouteIndex: 0,
        artifactId: dieline.artifact.artifactId,
        artifactVersion: 1,
      },
      {
        phaseId: "routes",
        selectedAt: ts,
        selectedRouteIndex: 0,
        selectedChoiceId: "route_01",
        artifactId: routes.artifact.artifactId,
        artifactVersion: 1,
      },
    ],
    masters: {
      masterArtifactId: routes.artifact.artifactId,
      masterExecutionId: "exec_routes_seed",
    },
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    selectedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "selected",
      },
      {
        artifactId: routes.artifact.artifactId,
        version: 1,
        phaseId: "routes",
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        role: "selected",
      },
    ],
    approvedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "approved",
      },
      {
        artifactId: routes.artifact.artifactId,
        version: 1,
        phaseId: "routes",
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        role: "approved",
      },
    ],
    generatedArtifacts: [
      {
        artifactId: dieline.artifact.artifactId,
        version: 1,
        phaseId: "dieline",
        artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
        role: "generated",
      },
      {
        artifactId: routes.artifact.artifactId,
        version: 1,
        phaseId: "routes",
        artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
        role: "generated",
      },
    ],
    ...extras,
  };
}

describe("CDF select_generation_for_continuation", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("1 — AVAILABLE creative continuation succeeds and advances to front-pack", () => {
    const sessionId = `cdf_gc_avail_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const threeD = createArtifact({
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      organizationId: ORG,
      projectId: PROJ,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "image",
      data: fixturePackaging3dDirection({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
      }) as never,
    });
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes, {
        generatedArtifacts: [
          {
            artifactId: dieline.artifact.artifactId,
            version: 1,
            phaseId: "dieline",
            artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
            role: "generated",
          },
          {
            artifactId: routes.artifact.artifactId,
            version: 1,
            phaseId: "routes",
            artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
            role: "generated",
          },
          {
            artifactId: threeD.artifact.artifactId,
            version: 1,
            phaseId: "3d-direction",
            artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
            role: "generated",
          },
        ],
      }),
    );

    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_3d_leaf_a",
      visualArtifactId: threeD.artifact.artifactId,
      visualArtifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      presentationEligibilityStatus: "AVAILABLE",
      generationFanoutGroupId: "fanout_g1",
      generationFanoutTargetId: "fanout_0_google",
      providerId: "provider.google",
      modelId: "gemini-3.1-flash-image",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(result.value.session.phaseId, "front-pack");
    assert.equal(result.value.nextWork.kind, "generate");
    const cont = result.value.session.generationContinuations?.at(-1);
    assert.ok(cont);
    assert.equal(cont!.selectionKind, "generation_continuation");
    assert.equal(cont!.visualArtifactId, threeD.artifact.artifactId);
    assert.equal(cont!.isDiagnosticRaw, false);
    assert.equal(cont!.upstreamArtifactId, routes.artifact.artifactId);
    assert.equal(cont!.upstreamArtifactVersion, 1);
  });

  it("2 — DIAGNOSTIC_PREVIEW_AVAILABLE continuation succeeds with raw art_*", () => {
    const sessionId = `cdf_gc_diag_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const rawId = "art_syncimg_86_1789500155136_0";
    const beforePins = [
      ...(session.generatedArtifacts ?? []),
      ...(session.selectedArtifacts ?? []),
      ...(session.approvedArtifacts ?? []),
    ].map((r) => `${r.artifactId}@${r.version}`);

    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_54_1789500142238",
      visualArtifactId: rawId,
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      generationFanoutGroupId: "fanout_g1",
      generationFanoutTargetId: "fanout_1_ideogram",
      providerId: "provider.ideogram",
      modelId: "ideogram-v3",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(result.value.session.phaseId, "front-pack");
    const cont = result.value.session.generationContinuations?.at(-1)!;
    assert.equal(cont.visualArtifactId, rawId);
    assert.equal(cont.isDiagnosticRaw, true);
    assert.equal(cont.generationFanoutTargetId, "fanout_1_ideogram");

    // 5/6/7 — no fake cdfart_*, no M9C-style pin, source not promoted AVAILABLE
    const after = result.value.session;
    const afterPins = [
      ...(after.generatedArtifacts ?? []),
      ...(after.selectedArtifacts ?? []),
      ...(after.approvedArtifacts ?? []),
    ];
    for (const pin of afterPins) {
      assert.ok(
        !pin.artifactId.startsWith("art_"),
        "raw art_* must never become selectedArtifacts/generated pins",
      );
    }
    assert.ok(
      !afterPins.some(
        (p) =>
          p.phaseId === "3d-direction" &&
          p.artifactId === rawId,
      ),
    );
    // Upstream routes X@V still bound (8)
    const routesPin = after.selectedArtifacts?.find(
      (p) => p.phaseId === "routes",
    );
    assert.equal(routesPin?.artifactId, routes.artifact.artifactId);
    assert.equal(routesPin?.version, 1);
    assert.equal(cont.upstreamArtifactId, routes.artifact.artifactId);
    assert.equal(cont.presentationEligibilityStatus, "DIAGNOSTIC_PREVIEW_AVAILABLE");
    // Pin set for upstream unchanged in identity
    for (const key of beforePins) {
      assert.ok(
        afterPins.some((p) => `${p.artifactId}@${p.version}` === key),
        `lost pin ${key}`,
      );
    }
  });

  it("3 — FAILED creative continuation rejected", () => {
    const sessionId = `cdf_gc_fail_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_fail",
      visualArtifactId: "art_syncimg_failed_0",
      presentationEligibilityStatus: "FAILED",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, false);
  });

  it("4 — missing raw media / visualArtifactId rejected", () => {
    const sessionId = `cdf_gc_nomedia_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_nomedia",
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      expectedVersion: session.sessionVersion,
    } as never);
    assert.equal(result.ok, false);
  });

  it("9/10 — exact clicked fanout target persisted; leaf A ≠ leaf B", () => {
    const sessionId = `cdf_gc_fanout_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const leafB = "art_syncimg_leaf_b";
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_leaf_b",
      visualArtifactId: leafB,
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      generationFanoutGroupId: "fanout_g_exact",
      generationFanoutTargetId: "fanout_1_ideogram",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const cont = result.value.session.generationContinuations!.at(-1)!;
    assert.equal(cont.executionId, "exec_leaf_b");
    assert.equal(cont.visualArtifactId, leafB);
    assert.equal(cont.generationFanoutTargetId, "fanout_1_ideogram");
    assert.notEqual(cont.generationFanoutTargetId, "fanout_0_google");
    assert.notEqual(cont.visualArtifactId, "art_syncimg_leaf_a");
  });

  it("11 — restart preserves continuation selection", () => {
    const sessionId = `cdf_gc_restart_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_restart",
      visualArtifactId: "art_syncimg_restart_0",
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      generationFanoutTargetId: "fanout_2_openai",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const reloaded = getCdfSession(sessionId);
    assert.ok(reloaded);
    const cont = reloaded!.generationContinuations?.at(-1) as
      | CdfGenerationContinuationSelection
      | undefined;
    assert.ok(cont);
    assert.equal(cont!.visualArtifactId, "art_syncimg_restart_0");
    assert.equal(cont!.generationFanoutTargetId, "fanout_2_openai");
    assert.equal(reloaded!.phaseId, "front-pack");
    const routesPin = reloaded!.selectedArtifacts?.find(
      (p) => p.phaseId === "routes",
    );
    assert.equal(routesPin?.artifactId, routes.artifact.artifactId);
  });

  it("12 — downstream CMR contains canonical direction + generation reference", () => {
    const cont: CdfGenerationContinuationSelection = {
      selectionKind: "generation_continuation",
      sourcePhaseId: "3d-direction",
      sourceArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      selectedAt: new Date().toISOString(),
      executionId: "exec_54_1789500142238",
      visualArtifactId: "art_syncimg_86_1789500155136_0",
      isDiagnosticRaw: true,
      generationFanoutGroupId: "fanout_g1",
      generationFanoutTargetId: "fanout_1_ideogram",
      providerId: "provider.google",
      modelId: "gemini-3.1-flash-image",
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      upstreamArtifactId: "cdfart_mu3265va_1_packaging-routes",
      upstreamArtifactVersion: 1,
      upstreamRouteIndex: 0,
    };
    const request = compileCanonicalGenerationRequest({
      resolved: {
        contextId: "ctx_gc",
        contextHash: "hash_gc",
        sessionId: "sess_gc",
        serviceId: "packaging",
        phaseId: "front-pack",
        sessionVersion: 3,
        contextSource: "session",
        status: "ready",
        phaseContext: {
          phaseId: "front-pack",
          serviceId: "packaging",
          name: "Front Pack",
          uxType: "generate",
          generationModality: "image",
          artifactType: "image",
          artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
          implementationStatus: "ready",
          dependencyPhaseIds: ["routes", "3d-direction"],
          allowNonVisualReady: false,
          selectionMode: "none",
          approvalMode: "none",
          refinementEnabled: false,
          refinementScopes: [],
          entryMessage: "Create front pack",
          description: "Front pack",
          executionStrategy: "canonical",
        },
        activeRequirements: [
          {
            requirementId: "req_1",
            key: "user.instruction",
            displayValue: "Continue the selected pack direction",
            priority: "explicit_current_user_instruction",
            category: "instruction",
            sourceInputId: "src_1",
          },
        ],
        constraints: [],
        exclusions: [],
        selections: [],
        approvedDecisions: [],
        upstreamInputs: [],
        upstreamOutputs: [],
        missingDependencies: [],
        unresolvedConflicts: [],
        warnings: [],
        provenance: { requirementIds: [], artifactPins: [] },
      } as never,
      upstream: [],
      currentUserInstruction: "Continue the selected pack direction",
      canonicalFullDeck: false,
      userSelectedGenerationReference: cont,
      selectedSemanticChoices: [
        {
          phaseId: "routes",
          artifactId: "cdfart_mu3265va_1_packaging-routes",
          version: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
          selectedRouteIndex: 0,
          optionNumber: 1,
          label: "Route 1",
          choiceArrayKey: "routes",
          choice: { routeId: "route_01", title: "Route 1" },
          semanticFieldNames: ["routeId", "title"],
        },
      ],
      brandContext: {
        brandId: "brand_x",
        facts: [{ key: "primary_color", value: "#111111" }],
        negatives: [],
        factKeys: ["primary_color"],
      },
    });

    assert.ok(request.userSelectedGenerationReference);
    assert.equal(
      request.userSelectedGenerationReference!.visualArtifactId,
      cont.visualArtifactId,
    );
    assert.ok(request.selectedSemanticChoices?.length);
    assert.equal(
      request.selectedSemanticChoices![0].artifactId,
      "cdfart_mu3265va_1_packaging-routes",
    );

    const cmr = compileCanonicalModelRequestFromGeneration(request);
    const parts = cmr.messages.flatMap((m) => m.content);
    const roles = parts.map((c) => c.semanticRole);
    assert.ok(
      roles.includes("user_selected_generation_reference"),
      JSON.stringify(roles),
    );
    assert.ok(request.selectedSemanticChoices != null);
    assert.ok(request.currentUserInstruction);
    assert.ok(request.brandContext);
    const visualBlock = parts.find(
      (c) => c.semanticRole === "user_selected_generation_reference",
    );
    assert.ok(visualBlock);
    const blob = JSON.stringify(visualBlock);
    assert.match(blob, /art_syncimg_86_1789500155136_0/);
    assert.match(blob, /fanout_1_ideogram/);
    assert.match(blob, /user_selected_generation_reference/);
    assert.match(blob, /SOURCE ASSET/);
    assert.match(blob, /subject_reference/);
    assert.doesNotMatch(blob, /inspired by/i);
    assert.doesNotMatch(blob, /take inspiration/i);
  });

  it("13/14 — remote nextWork comes from result.nextWork (front-pack generate)", () => {
    const sessionId = `cdf_gc_nw_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_nw",
      visualArtifactId: "art_syncimg_nw_0",
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.ok(result.value.nextWork);
    assert.equal(result.value.nextWork.kind, "generate");
    if (result.value.nextWork.kind === "run_generation") {
      assert.equal(result.value.nextWork.phaseId, "front-pack");
    }
    // Not inventing local nextWork — phase advanced by state machine.
    assert.equal(result.value.session.phaseId, "front-pack");
  });

  it("15 — diagnostic continuation does not create new ArtifactVersion for raw media", () => {
    const sessionId = `cdf_gc_noav_${Date.now().toString(36)}`;
    const { dieline, routes } = seedUpstream(sessionId);
    const session = saveCdfSession(
      sessionOn3dDirection(sessionId, dieline, routes),
    );
    const beforeGenerated = session.generatedArtifacts?.length ?? 0;
    const result = applyCdfTransition({
      sessionId,
      action: "select_generation_for_continuation",
      executionId: "exec_noav",
      visualArtifactId: "art_syncimg_noav_0",
      presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const afterGenerated = result.value.session.generatedArtifacts?.length ?? 0;
    assert.equal(afterGenerated, beforeGenerated);
    assert.ok(
      !(result.value.session.generatedArtifacts ?? []).some((g) =>
        g.artifactId.startsWith("art_"),
      ),
    );
  });
});
