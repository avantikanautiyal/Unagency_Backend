/**
 * Logo Options → Logo System → Final continuity + composition (generic).
 * No provider/model/service/phase-ID semantic runtime branches under test as the fix.
 */

import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import {
  resolveCdfPhaseExecutionContract,
  tryResolveCdfPhaseDependencies,
  resolveLegacyCdfConfigFromCanonical,
} from "../../../src/platform/cdf/canonical";
import {
  resolveDeliverableCompositionContract,
  DELIVERABLE_KIND_PROFILES,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { resolveCdfStageDeliverable } from "../../../../Unagency-frontend/packages/api/src/domain/cdf-stage-deliverable";
import { compileDeliverableComposition } from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { resolveUpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";
import { flattenCanonicalModelRequestToLabeledPrompt } from "../../../src/platform/ai/canonical-model-request/flatten-labeled";
import { compileCanonicalModelRequestFromGeneration } from "../../../src/platform/cdf/generation-context/compile-model-request";
import type { CanonicalGenerationRequest } from "../../../src/platform/cdf/generation-context/types";
import { cdfExecutionRequiresMediaArtifact } from "../../../src/platform/cdf/execution-authority";
import { resolveCdfFinalAction } from "../../../../Unagency-frontend/packages/api/src/domain/cdf-final-actions";

function baseLogoSystemGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  return {
    currentUserInstruction: "Build the logo system from the selected mark.",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "Sunflower",
      facts: [{ key: "brandName", value: "Sunflower" }],
      negatives: [],
      factKeys: ["brandName"],
    },
    productGrounding: {},
    selectedSemanticChoices: [
      {
        phaseId: "territories",
        artifactId: "cdfart_territory",
        version: 1,
        artifactKey: "logo.territories",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Territory 1",
        choiceArrayKey: "routes",
        choice: {
          name: "Warm geometric",
          creativeIdea: "Sunflower petal geometry",
          visualTreatment: "Rounded petals, strong wordmark",
        },
        semanticFieldNames: ["name", "creativeIdea", "visualTreatment"],
      },
    ],
    cdfContext: {
      contextId: "ctx1",
      contextHash: "h1",
      sessionId: "sess1",
      serviceId: "logo",
      phaseId: "logo-system",
      sessionVersion: 1,
      contextSource: "test",
      status: "active",
      phaseContext: {
        phaseId: "logo-system",
        serviceId: "logo",
        phaseName: "Logo System",
        phaseType: "output",
        artifactKey: "logo.logo-system",
        name: "Logo System",
        uxType: "visual",
        generationModality: "image",
        artifactType: "logo",
        implementationStatus: "active",
        dependencyPhaseIds: ["logo-options"],
        allowNonVisualReady: false,
        selectionMode: "required_one",
        approvalMode: "required",
        refinementEnabled: false,
        refinementScopes: [],
        entryMessage: "Logo system applications:",
        description: "",
        executionStrategy: "canonical",
        outputLabel: "Logo System",
      },
      workingSet: {
        brief: null,
        masters: [],
        decisions: [],
        openQuestions: [],
      },
    },
    upstreamArtifacts: [
      {
        artifactId: "cdfart_logo_option_2",
        version: 1,
        artifactKey: "logo.logo-options",
        phaseId: "logo-options",
        role: "approved_content",
        status: "approved",
        schemaVersion: "1",
        data: { title: "Selected logo option" },
        lineage: { sourceArtifacts: [] },
        sessionRole: "approved",
        required: true,
      },
    ],
    outputContract: {
      serviceId: "logo",
      phaseId: "logo-system",
      generationModality: "image",
      artifactKey: "logo.logo-system",
      canonicalFullDeck: false,
      instructions: ["Generate logo system"],
    },
    generationContextHash: "genhash",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("Logo system deliverable composition (generic)", () => {
  it("1–3. logo-options remains logo kind; logo-system is logo_system (not logo)", () => {
    const options = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-options",
    });
    const system = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-system",
    });
    assert.equal(options?.deliverableKind, "logo");
    assert.equal(options?.allowsModelGenerationFanout, true);
    assert.equal(system?.deliverableKind, "logo_system");
    assert.equal(system?.allowsModelGenerationFanout, false);
    assert.equal(system?.artifactKey, "logo.logo-system");
  });

  it("4–6. Logo System composition is declarative logo_system — not isolated logo", () => {
    const contract = resolveDeliverableCompositionContract("logo_system");
    assert.ok(contract);
    assert.equal(contract!.kind, "logo_system");
    assert.equal(contract!.visualPolicy?.layoutIntent, "identity_system_sheet");
    assert.ok(contract!.requiredElements.includes("identity_mark"));
    assert.ok(contract!.requiredElements.includes("layout_zones"));
    assert.notEqual(
      contract!.visualPolicy?.layoutIntent,
      "identity_mark_isolated",
    );
    const logoOnly = resolveDeliverableCompositionContract("logo");
    assert.equal(logoOnly!.visualPolicy?.layoutIntent, "identity_mark_isolated");
    assert.notEqual(contract!.kind, logoOnly!.kind);
  });

  it("5. stage deliverable for logo-system resolves from phase deliverableKind", () => {
    const config = resolveLegacyCdfConfigFromCanonical("logo");
    assert.ok(config);
    const phase = config!.phases.find((p) => p.id === "logo-system");
    assert.ok(phase);
    const deliverable = resolveCdfStageDeliverable(phase!, config!);
    assert.equal(deliverable.kind, "logo_system");
    assert.match(deliverable.mustProduce, /logo-system|system presentation/i);
    assert.match(deliverable.mustNotProduce, /isolated logo|new unrelated/i);
  });

  it("7. compiled Logo System prompt includes system composition + preserve guidance", () => {
    const contract = resolveDeliverableCompositionContract("logo_system")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "logo_system",
      contract,
      currentUserInstruction: "Build the logo system from the selected mark.",
      generationModality: "image",
      selectedChoice: baseLogoSystemGeneration().selectedSemanticChoices![0],
      brandContext: baseLogoSystemGeneration().brandContext,
    });
    assert.equal(compiled.deliverableKind, "logo_system");
    assert.equal(compiled.policies.visual.layoutIntent, "identity_system_sheet");
    assert.ok(
      compiled.compositionGuidance.some((g) =>
        /preserve|do not invent|selected/i.test(g),
      ),
    );

    const cmr = compileCanonicalModelRequestFromGeneration(
      baseLogoSystemGeneration(),
      { deliverableComposition: compiled },
    );
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    const text = String(flat).toLowerCase();
    assert.match(text, /identity_system_sheet|layout_zones|logo.system/i);
    assert.match(text, /preserve|do not invent|selected mark/i);
  });

  it("4+8. exact upstream Logo Option X@V projects into Logo System context", () => {
    const exactId = "cdfart_logo_option_leaf_2";
    const upstream: UpstreamArtifactContext = {
      artifactId: exactId,
      version: 3,
      artifactKey: "logo.logo-options",
      phaseId: "logo-options",
      role: "approved_content",
      status: "approved",
      schemaVersion: "1",
      data: {
        title: "Option 2",
        vaultAssetId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      },
      lineage: { sourceArtifacts: [] },
      sessionRole: "approved",
      required: true,
    };
    const resolved = resolveUpstreamArtifactContext({ upstream });
    assert.equal(resolved.artifactId, exactId);
    assert.equal(resolved.artifactVersion, 3);
    assert.equal(resolved.artifactKey, "logo.logo-options");
    assert.equal(resolved.mediaReference.present, true);
  });

  it("11–13. Final depends on logo-system; download prefers logo.logo-system", () => {
    const final = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "final",
    });
    assert.equal(final?.generationModality, "materialize");
    const deps = tryResolveCdfPhaseDependencies("logo", "final");
    assert.equal(deps.ok, true);
    if (!deps.ok) return;
    assert.ok(
      deps.dependencies.some((d) => d.phaseId === "logo-system"),
      `expected logo-system dep; got ${JSON.stringify(deps.dependencies.map((d) => d.phaseId))}`,
    );
    const action = resolveCdfFinalAction("Download Logo Pack", "logo");
    assert.equal(action.kind, "download_primary");
    assert.deepEqual(action.preferredArtifactKeys, ["logo.logo-system"]);
    assert.equal(action.format, "png");
  });

  it("14–15. Final is materialize — not logo-options / logo-system image regen", () => {
    const final = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "final",
    });
    assert.equal(final?.generationModality, "materialize");
    assert.notEqual(final?.generationModality, "image");
  });

  it("16. Final declared representations are png pack — not invented SVG", () => {
    const action = resolveCdfFinalAction("Download Logo Pack", "logo");
    assert.equal(action.format, "png");
    assert.ok(!String(action.format ?? "").toLowerCase().includes("svg"));
  });

  it("10. image logo_system still requires media; structured remains N/A", () => {
    assert.equal(
      cdfExecutionRequiresMediaArtifact({
        cdfAuthorityGenerationModality: "image",
        cdfAuthorityOutputKind: "image",
      }),
      true,
    );
    assert.equal(
      cdfExecutionRequiresMediaArtifact({
        cdfAuthorityGenerationModality: "structured",
      }),
      false,
    );
  });

  it("20–23. no provider/model/phase-ID branches in composition module for logo_system", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition.ts",
      ),
      "utf8",
    );
    assert.match(src, /LOGO_SYSTEM_COMPOSITION/);
    assert.match(src, /identity_system_sheet/);
    assert.doesNotMatch(src, /if\s*\(\s*phaseId\s*===/);
    assert.doesNotMatch(src, /openai|gemini|ideogram|gpt-image/i);
    const profile = DELIVERABLE_KIND_PROFILES.logo_system;
    assert.ok(profile.composition);
    assert.equal(profile.composition!.kind, "logo_system");
  });
});
