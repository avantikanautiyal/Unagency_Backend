/**
 * Live bug (exec_191_1790192446612, session cdf_muei9tea_pe9gputh): front-pack
 * failed CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT before provider invocation.
 *
 * Root cause: front-pack declared only `3d-direction` as a dependency.
 * 3d-direction's own structured data (candidates[].visualIntent/camera/
 * lighting/material notes) has NO rendered-communication fields — it is the
 * physical/production authority, not the message authority. The message
 * (primaryMessage/communicationObjective/...) lives on the SELECTED Routes
 * direction, which front-pack never declared a dependency on, so
 * resolveSelectedSemanticChoices had no upstream entry to resolve the
 * session's routes selection against and the compiler received an empty
 * primary_message_surface.
 *
 * Fix: front-pack now declares `['3d-direction', 'routes']` — the same
 * generic dependency-declaration mechanism every other phase already uses.
 * No runtime branch, no phase-specific code, no phase-prompt fallback.
 */

import {
  resolveDeliverableCompositionContract,
  requiredExactRenderedCommunicationElements,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { resolveCdfCanonicalService } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/registry";
import { resolveSelectedSemanticChoices } from "../../../src/platform/cdf/generation-context/resolve-selected-choice";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";
import { compileDeliverableComposition } from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { assertRequiredCommunicationValuesResolved } from "../../../src/platform/cdf/generation-context/composition-authority";

// Exact live shapes (field names only; values genericized).
const ROUTE_2 = {
  routeId: "route_3",
  name: "Jewel Box Opulence",
  shelfIdea: "Bold jewel-tone box with metallic logo.",
  hierarchyThought: "Logo first, motifs second.",
  visualDirection: "Vibrant turquoise/coral base, metallic foil logo.",
  communicationObjective:
    "Create immediate shelf presence and emotional connection; signal that the jewelry is vibrant, celebratory, and designed for confident women who love color and craft.",
  primaryMessage: "Luxurious color, timeless craft.",
  secondaryMessage: "Jewelry as art, packaging as experience.",
  visualConcept: "Vibrant jewel-tone box with metallic logo and jewelry-inspired graphic flourishes.",
  focalPoint: "Logo in metallic foil, centered on lid.",
  composition: "Centered logo with supporting jewelry illustrations framing the mark.",
  brandIntegration: "Logo is the central brand anchor.",
  identityMarkRole: "Hero brand element.",
};

const CANDIDATE_0 = {
  id: "direction_01",
  name: "3D Direction",
  visualIntent: "Pack three-quarter product visualization for the selected design route",
  packageFormNotes: "Rigid box, hinged lid.",
  cameraNotes: "45-degree hero angle.",
  lightingNotes: "Soft studio key + rim light.",
  materialNotes: "Matte board with foil accents.",
  previewAssetRef: { vaultAssetId: "6ab42b69b064d3a41f87a8db", role: "preview" },
};

function upstream(over: Partial<UpstreamArtifactContext>): UpstreamArtifactContext {
  return {
    artifactId: "cdfart_x",
    version: 1,
    artifactKey: "packaging.x",
    phaseId: "x",
    role: "selected_reference",
    status: "accepted",
    schemaVersion: "1",
    data: {},
    lineage: { sourceArtifacts: [] },
    sessionRole: "selected",
    required: true,
    ...over,
  };
}

describe("packaging front-pack — communication surface source (live bug regression)", () => {
  it("1. registry declares routes as a front-pack dependency (the message authority)", () => {
    const svc = resolveCdfCanonicalService("packaging")!;
    const frontPack = svc.phases.find((p) => p.phaseId === "front-pack")!;
    const depIds = frontPack.dependencies.map((d) => d.phaseId);
    expect(depIds).toContain("3d-direction");
    expect(depIds).toContain("routes");
  });

  it("front-pack (pack_flat) requires an exact-message primary_message_surface", () => {
    const contract = resolveDeliverableCompositionContract("pack_flat")!;
    expect(requiredExactRenderedCommunicationElements(contract)).toContain(
      "primary_message_surface",
    );
  });

  it("2. resolveSelectedSemanticChoices resolves the ROUTES selection (message-bearing), not 3d-direction (no message fields)", () => {
    const upstreamCtx: UpstreamArtifactContext[] = [
      upstream({
        artifactId: "cdfart_routes",
        phaseId: "routes",
        artifactKey: "packaging.routes",
        sessionRole: "selected",
        data: { schemaId: "CdfPackagingRoutes", routes: [{}, {}, ROUTE_2] },
      }),
      upstream({
        artifactId: "cdfart_3d",
        phaseId: "3d-direction",
        artifactKey: "packaging.3d-direction",
        sessionRole: "approved",
        data: { schemaId: "CdfPackaging3dDirection", candidates: [CANDIDATE_0] },
      }),
    ];
    // Session selection history — 3d-direction was approved directly (no
    // route-index selection step), matching the live session exactly.
    const selections = [
      { phaseId: "dieline", label: "l", routeIndex: 1, semantic: "selection" as const },
      { phaseId: "routes", label: "l", routeIndex: 2, semantic: "selection" as const },
    ];
    const result = resolveSelectedSemanticChoices({
      selections,
      upstream: upstreamCtx,
      failClosed: true,
      requirePhaseIds: ["routes"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.phaseId).toBe("routes");
    expect(result.choices[0]!.choice).toMatchObject({ primaryMessage: ROUTE_2.primaryMessage });
  });

  it("3/4. compiled composition resolves primary_message_surface from the routes choice; CMR invariant passes", () => {
    const contract = resolveDeliverableCompositionContract("pack_flat")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "pack_flat",
      contract,
      selectedChoice: {
        phaseId: "routes",
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "packaging.routes",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "Choice 3",
        choiceArrayKey: "routes",
        choice: ROUTE_2,
        semanticFieldNames: Object.keys(ROUTE_2),
      },
      currentUserInstruction: "Create box design for my brand.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({
      resolutionStatus: "resolved",
      text: ROUTE_2.primaryMessage,
      provenance: "selected_semantic_direction",
    });
    expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(true);
  });

  it("5. phase prompt alone (no routes choice) never becomes the authoritative message — fails closed", () => {
    const contract = resolveDeliverableCompositionContract("pack_flat")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "pack_flat",
      contract,
      currentUserInstruction:
        "Create box design for my brand. Use the brand logo and the brand colours. Make it luxurious.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({ resolutionStatus: "unresolved" });
    expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(false);
  });

  it("6. the 3d-direction candidate object alone never resolves the message surface (no message fields)", () => {
    const contract = resolveDeliverableCompositionContract("pack_flat")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "pack_flat",
      contract,
      selectedChoice: {
        phaseId: "3d-direction",
        artifactId: "cdfart_3d",
        version: 1,
        artifactKey: "packaging.3d-direction",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Direction 1",
        choiceArrayKey: "candidates",
        choice: CANDIDATE_0,
        semanticFieldNames: Object.keys(CANDIDATE_0),
      },
      currentUserInstruction: "Create box design for my brand.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({ resolutionStatus: "unresolved" });
  });
});
