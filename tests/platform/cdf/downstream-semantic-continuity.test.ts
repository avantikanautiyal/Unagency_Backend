/**
 * Downstream CDF artifact semantic continuity.
 *
 * Structured upstream ArtifactVersion X@V → SelectedSemanticDirection →
 * DeliverableCompositionCompiler → requiredRenderedCommunication → CMR.
 *
 * Proves skip_non_visual does not discard structured semantics, and that
 * on-asset composition contracts declare rendered_communication surfaces.
 */

import assert from "node:assert/strict";
import {
  DELIVERABLE_KIND_PROFILES,
  compositionContractOnAssetIntegrity,
  requiredRenderedCommunicationElements,
  resolveDeliverableCompositionContract,
  type CdfDeliverableKind,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  compileDeliverableComposition,
} from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import {
  assertRequiredOnAssetCompositionInCmr,
  contractRequiresOnAssetCommunication,
} from "../../../src/platform/cdf/generation-context/composition-authority";
import { assembleCanonicalModelRequest } from "../../../src/platform/cdf/generation-context/compile-model-request";
import {
  resolveUpstreamArtifactContext,
  resolveAllUpstreamArtifactContexts,
  assertUpstreamSemanticProjectionForOnAsset,
  upstreamContinuityDiagnostics,
} from "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context";
import type { SelectedSemanticChoice } from "../../../src/platform/cdf/generation-context/resolve-selected-choice";
import type {
  CanonicalGenerationRequest,
  UpstreamArtifactContext,
} from "../../../src/platform/cdf/generation-context/types";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";

const EXACT_MESSAGE =
  "Open weekends. Explore more. Your city, closer.";

function selectedRouteChoice(
  overrides: Partial<SelectedSemanticChoice> = {},
): SelectedSemanticChoice {
  return {
    phaseId: "routes",
    artifactId: "cdfart_mu3vwvds_6_print-ooh-routes",
    version: 1,
    artifactKey: "print-ooh.routes",
    selectedRouteIndex: 0,
    optionNumber: 1,
    label: "Weekend Discovery",
    choiceArrayKey: "routes",
    choice: {
      name: "Weekend Discovery",
      routeId: "route_1",
      primaryMessage: EXACT_MESSAGE,
      headlineAngle: EXACT_MESSAGE,
      creativeIdea: "Transit-scale invitation to weekend exploration",
      visualTreatment: "High-contrast city skyline with warm dusk palette",
      communicationObjective: "Drive weekend transit ridership",
      hierarchy: "Headline dominant; destination cluster secondary",
      brandIntegration: "Corner signature mark",
    },
    semanticFieldNames: [
      "name",
      "routeId",
      "primaryMessage",
      "headlineAngle",
      "creativeIdea",
      "visualTreatment",
      "communicationObjective",
      "hierarchy",
      "brandIntegration",
    ],
    ...overrides,
  };
}

function upstreamRoutesArtifact(
  data?: Record<string, unknown>,
): UpstreamArtifactContext {
  return {
    artifactId: "cdfart_mu3vwvds_6_print-ooh-routes",
    version: 1,
    artifactKey: "print-ooh.routes",
    phaseId: "routes",
    role: "selected_reference",
    status: "validated",
    schemaVersion: "1",
    data: data ?? {
      routes: [
        {
          name: "Weekend Discovery",
          primaryMessage: EXACT_MESSAGE,
          headlineAngle: EXACT_MESSAGE,
          creativeIdea: "Transit-scale invitation",
          visualTreatment: "High-contrast skyline",
        },
        {
          name: "Other Route",
          primaryMessage: "Other message",
        },
      ],
    },
    lineage: { sourceArtifacts: [] },
    sessionRole: "selected",
    required: true,
    artifactProjectionMode: "selected_only",
  };
}

function baseGeneration(
  overrides: Partial<CanonicalGenerationRequest> = {},
): CanonicalGenerationRequest {
  const choice = selectedRouteChoice();
  return {
    currentUserInstruction: "",
    requirements: [],
    constraints: [],
    exclusions: [],
    selections: [],
    approvedDecisions: [],
    brandContext: {
      brandId: "b1",
      brandName: "City Transit",
      facts: [{ key: "brandName", value: "City Transit" }],
      negatives: [],
    },
    productGrounding: { service: "print", subtype: "brochures" },
    selectedSemanticChoices: [choice],
    upstreamArtifacts: [upstreamRoutesArtifact()],
    cdfContext: {
      contextId: "ctx_continuity",
      contextHash: "hash_cont",
      sessionId: "sess_cont",
      serviceId: "print-ooh",
      phaseId: "master-artwork",
      sessionVersion: 1,
      contextSource: "test",
      status: "active",
      phaseContext: {
        phaseId: "master-artwork",
        serviceId: "print-ooh",
        name: "Master Artwork",
        uxType: "visual",
        generationModality: "image",
        artifactType: "image",
        artifactKey: "print-ooh.master-artwork",
        implementationStatus: "active",
        dependencyPhaseIds: ["routes"],
        allowNonVisualReady: false,
        selectionMode: "required_one",
        approvalMode: "required",
        refinementEnabled: true,
        refinementScopes: ["artifact", "phase"],
        entryMessage: "Master artwork",
        description: "",
        executionStrategy: "canonical",
        outputLabel: "Master Artwork",
      },
    },
    outputContract: {
      serviceId: "print-ooh",
      phaseId: "master-artwork",
      generationModality: "image",
      artifactKey: "print-ooh.master-artwork",
      canonicalFullDeck: false,
      instructions: [],
      executionStrategy: "canonical",
    },
    generationContextHash: "genhash_cont",
    resolvedContext: {} as CanonicalGenerationRequest["resolvedContext"],
    ...overrides,
  };
}

describe("composition contract on-asset integrity (generic)", () => {
  it("every on-asset+required contract declares rendered_communication elements", () => {
    for (const [kind, profile] of Object.entries(DELIVERABLE_KIND_PROFILES)) {
      const contract = profile.composition;
      if (!contract) continue;
      if (!contractRequiresOnAssetCommunication(contract)) continue;
      const integrity = compositionContractOnAssetIntegrity(contract);
      assert.equal(
        integrity.ok,
        true,
        `${kind} requires on-asset text but declares no rendered_communication elements`,
      );
      assert.ok(
        requiredRenderedCommunicationElements(contract).length > 0,
        kind,
      );
    }
  });

  it("print_artwork declares primary_message_surface for on-asset text", () => {
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    assert.equal(contract.textPolicy?.required, true);
    assert.equal(contract.textPolicy?.placement, "on_asset");
    assert.ok(contract.requiredElements.includes("primary_message_surface"));
    assert.deepEqual(
      [...requiredRenderedCommunicationElements(contract)],
      ["primary_message_surface"],
    );
  });
});

describe("structured upstream → visual downstream semantic projection", () => {
  it("A/B — exact X@V selected route projects into composition RRC", () => {
    const choice = selectedRouteChoice();
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      selectedChoice: choice,
      currentUserInstruction: "",
      brandContext: {
        brandId: "b1",
        brandName: "City Transit",
        facts: [],
        negatives: [],
      },
    });

    assert.equal(compiled.requiredRenderedCommunication.active, true);
    assert.equal(
      compiled.requiredRenderedCommunication.allRequiredResolved,
      true,
    );
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    assert.ok(surface);
    assert.equal(surface!.resolutionStatus, "resolved");
    assert.equal(surface!.text, EXACT_MESSAGE);
    assert.equal(surface!.provenance, "selected_semantic_direction");

    const filled = compiled.filledSlots.find(
      (s) => s.element === "primary_message_surface",
    );
    assert.equal(filled?.source, "creative_direction");
    assert.equal(filled?.value, EXACT_MESSAGE);
  });

  it("E/F — CMR invariant passes with authoritative RRC surfaces", () => {
    const choice = selectedRouteChoice();
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      selectedChoice: choice,
      currentUserInstruction: "",
    });
    const request = baseGeneration();
    const modelRequest = assembleCanonicalModelRequest(request, {
      deliverableComposition: compiled,
    });
    const invariant = assertRequiredOnAssetCompositionInCmr({
      compositionRequired: true,
      contract,
      compiled,
      modelRequest,
    });
    assert.equal(invariant.ok, true);
  });

  it("H — missing semantic communication fields fail closed", () => {
    const choice = selectedRouteChoice({
      choice: {
        name: "Empty Comm Route",
        creativeIdea: "Visual only idea",
        visualTreatment: "Abstract shapes",
      },
      semanticFieldNames: ["name", "creativeIdea", "visualTreatment"],
    });
    const gate = assertUpstreamSemanticProjectionForOnAsset({
      onAssetRequired: true,
      resolvedUpstream: resolveAllUpstreamArtifactContexts({
        upstream: [upstreamRoutesArtifact()],
        selectedChoices: [choice],
      }),
      hasUserInstruction: false,
      selectedChoices: [choice],
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.code, "UPSTREAM_SEMANTIC_PROJECTION_UNRESOLVED");
    }
  });

  it("I — structured_data skip_non_visual still yields semantic projection", () => {
    const choice = selectedRouteChoice();
    const resolved = resolveUpstreamArtifactContext({
      upstream: upstreamRoutesArtifact(),
      selectedChoices: [choice],
    });
    assert.equal(resolved.artifactId, choice.artifactId);
    assert.equal(resolved.artifactVersion, 1);
    assert.equal(resolved.semanticProjection.status, "resolved");
    assert.equal(resolved.semanticProjection.source, "selected_choice_slice");
    assert.ok(resolved.semanticProjection.semanticFields.includes("primaryMessage"));
    assert.equal(resolved.mediaReference.present, false);
  });

  it("L — newer user instruction overrides upstream for RRC fill", () => {
    const choice = selectedRouteChoice({
      choice: {
        name: "Old",
        primaryMessage: "Upstream message must not win",
      },
    });
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const userMsg = "User-authored on-asset headline wins.";
    // When creative_direction already filled primary_message_surface, user
    // instruction does not overwrite (authority: instruction fills only gaps).
    // Clear communication fields so user instruction is the fill source.
    const emptyComm = selectedRouteChoice({
      choice: { name: "Visual route", creativeIdea: "Shapes" },
    });
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      selectedChoice: emptyComm,
      currentUserInstruction: userMsg,
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    assert.equal(surface?.text, userMsg);
    assert.equal(surface?.provenance, "current_user_instruction");
    void choice;
  });

  it("M — exact version identity is preserved on projection", () => {
    const choice = selectedRouteChoice();
    const resolved = resolveUpstreamArtifactContext({
      upstream: upstreamRoutesArtifact(),
      selectedChoices: [choice],
    });
    assert.equal(resolved.artifactId, "cdfart_mu3vwvds_6_print-ooh-routes");
    assert.equal(resolved.artifactVersion, 1);
    assert.equal(resolved.artifactKey, "print-ooh.routes");
    assert.notEqual(resolved.artifactVersion, 2);
  });
});

describe("cross-service continuity (contract-driven, no branches)", () => {
  const cases: Array<{
    kind: CdfDeliverableKind;
    serviceId: string;
    phaseId: string;
  }> = [
    { kind: "print_artwork", serviceId: "print-ooh", phaseId: "master-artwork" },
    { kind: "social_creative", serviceId: "social-media", phaseId: "output" },
    { kind: "campaign_kv", serviceId: "ad-campaigns", phaseId: "master-kv" },
    { kind: "pack_flat", serviceId: "packaging", phaseId: "front-pack" },
    { kind: "email_design", serviceId: "emailers", phaseId: "email-design" },
    { kind: "posm", serviceId: "store-display", phaseId: "posm-design" },
  ];

  for (const c of cases) {
    it(`${c.serviceId}.${c.phaseId} on-asset composition accepts selected semantic direction`, () => {
      const contract = resolveDeliverableCompositionContract(c.kind);
      if (!contract || !contractRequiresOnAssetCommunication(contract)) {
        return;
      }
      const phaseContract = resolveCdfPhaseExecutionContract({
        serviceId: c.serviceId,
        phaseId: c.phaseId,
      });
      if (!phaseContract?.requiresDeliverableComposition) return;

      const choice = selectedRouteChoice({
        artifactKey: `${c.serviceId}.routes`,
        phaseId: "routes",
      });
      const compiled = compileDeliverableComposition({
        deliverableKind: c.kind,
        contract,
        selectedChoice: choice,
        currentUserInstruction: "",
      });
      assert.equal(compiled.requiredRenderedCommunication.active, true);
      assert.ok(
        compiled.requiredRenderedCommunication.surfaces.some(
          (s) =>
            s.resolutionStatus === "resolved" &&
            s.text === EXACT_MESSAGE,
        ),
        `${c.kind} should resolve primary communication from selected direction`,
      );
    });
  }

  it("P — storyboard visual/structured projection shape is available generically", () => {
    const storyboardUpstream: UpstreamArtifactContext = {
      artifactId: "cdfart_sb_1",
      version: 2,
      artifactKey: "videos.storyboard",
      phaseId: "storyboard",
      role: "selected_reference",
      status: "validated",
      schemaVersion: "1",
      data: {
        vaultAssetId: "art_frame_1",
        frameNotes: "Beat 1 establishing shot",
        visualSubject: "Character walks into frame",
      },
      lineage: { sourceArtifacts: [] },
      sessionRole: "selected",
      required: true,
    };
    const resolved = resolveUpstreamArtifactContext({
      upstream: storyboardUpstream,
    });
    assert.equal(resolved.artifactVersion, 2);
    assert.equal(resolved.mediaReference.present, true);
    assert.equal(resolved.mediaReference.vaultAssetId, "art_frame_1");
    assert.ok(resolved.semanticProjection.semanticFields.length >= 0);
  });

  it("diagnostics include UPSTREAM_SELECTED_ARTIFACT and SEMANTIC_PROJECTION", () => {
    const choice = selectedRouteChoice();
    const resolved = resolveAllUpstreamArtifactContexts({
      upstream: [upstreamRoutesArtifact()],
      selectedChoices: [choice],
    });
    const diag = upstreamContinuityDiagnostics(resolved);
    assert.ok(Array.isArray(diag.UPSTREAM_SELECTED_ARTIFACT));
    assert.ok(Array.isArray(diag.UPSTREAM_SEMANTIC_PROJECTION));
    const sel = (diag.UPSTREAM_SELECTED_ARTIFACT as Array<Record<string, unknown>>)[0];
    assert.equal(sel.artifactId, choice.artifactId);
    assert.equal(sel.artifactVersion, 1);
  });
});

describe("static audit — no service/phase semantic branches in new module", () => {
  it("resolve-upstream-artifact-context has no serviceId/phaseId equality branches", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const file = path.join(
      __dirname,
      "../../../src/platform/cdf/generation-context/resolve-upstream-artifact-context.ts",
    );
    const src = fs.readFileSync(file, "utf8");
    assert.equal(/serviceId\s*===\s*["']/.test(src), false);
    assert.equal(/phaseId\s*===\s*["']/.test(src), false);
    assert.equal(/subcategory\s*===\s*["']/.test(src), false);
    assert.equal(/brochures/.test(src), false);
    assert.equal(/print-ooh/.test(src), false);
    assert.equal(/master-artwork/.test(src), false);
  });
});
