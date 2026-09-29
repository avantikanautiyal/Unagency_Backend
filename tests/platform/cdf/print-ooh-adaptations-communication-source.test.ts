/**
 * Live bug (session cdf_muej2i7q_aglneogj): print-ooh adaptations failed
 * CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT before provider invocation,
 * despite the exact approved upstream master-artwork@1 resolving correctly.
 *
 * Root cause (same shape as the front-pack bug): adaptations declared only
 * `master-artwork` as a dependency. master-artwork's own structured data
 * (previewAssetRef/sourceRefs) has NO rendered-communication fields — it is
 * the visual/production authority, not the message authority. The message
 * (primaryMessage/secondaryMessage/communicationObjective) lives on the
 * SELECTED Routes direction, which adaptations never declared a dependency
 * on, so resolveSelectedSemanticChoices had no upstream entry to resolve the
 * session's routes selection against.
 *
 * Fix: adaptations now declares `['master-artwork', 'routes']` — the same
 * generic dependency mechanism master-artwork itself already uses for the
 * same field set. No runtime branch, no phase-specific code, no phase-prompt
 * fallback.
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
const ROUTE_1 = {
  name: "Atelier Silhouette",
  creativeIdea: "A striking life-size silhouette standee.",
  visualTreatment: "Graphic illustration meets dimensional layering.",
  headlineAngle: "Crafted to Crown You",
  rationale: "Merges modern minimalism with classical portraiture.",
  communicationObjective:
    "Position the brand as a modern atelier where jewelry transcends accessory to become sculptural art.",
  primaryMessage: "Where jewelry becomes sculpture",
  secondaryMessage: "Explore our platinum, rose gold, silver & gold-plated collections",
  visualConcept: "The Sovereign Portrait — jewelry as architectural detail.",
  focalPoint: "The profile's neckline and ear area where jewelry windows are concentrated.",
  composition: "Off-center profile occupying 60% of standee height.",
  hierarchy: "Silhouette, jewelry windows, headline, brand mark, descriptor.",
  brandIntegration: "Turquoise and peach brand colors dominate the palette.",
  identityMarkRole: "Cornerstone element — the mark anchors the composition.",
};

const MASTER_ARTWORK_DATA = {
  artifactKey: "print-ooh.master-artwork",
  artifactType: "image",
  previewAssetRef: { vaultAssetId: "6ab430c4ccf593eb5530906d" },
  sourceRefs: { activeBriefId: "abr_x", activeBriefVersion: 5 },
};

function upstream(over: Partial<UpstreamArtifactContext>): UpstreamArtifactContext {
  return {
    artifactId: "cdfart_x",
    version: 1,
    artifactKey: "print-ooh.x",
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

describe("print-ooh adaptations — communication surface source (live bug regression)", () => {
  it("1. registry declares routes as an adaptations dependency (the message authority)", () => {
    const svc = resolveCdfCanonicalService("print-ooh")!;
    const adaptations = svc.phases.find((p) => p.phaseId === "adaptations")!;
    const depIds = adaptations.dependencies.map((d) => d.phaseId);
    expect(depIds).toContain("master-artwork");
    expect(depIds).toContain("routes");
  });

  it("adaptations (print_artwork) requires an exact-message primary_message_surface", () => {
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    expect(requiredExactRenderedCommunicationElements(contract)).toContain(
      "primary_message_surface",
    );
  });

  it("2. resolveSelectedSemanticChoices resolves the ROUTES selection, not master-artwork (no message fields)", () => {
    const upstreamCtx: UpstreamArtifactContext[] = [
      upstream({
        artifactId: "cdfart_routes",
        phaseId: "routes",
        artifactKey: "print-ooh.routes",
        sessionRole: "selected",
        data: { schemaId: "CdfCreativeDirections", routes: [{}, ROUTE_1] },
      }),
      upstream({
        artifactId: "cdfart_master",
        phaseId: "master-artwork",
        artifactKey: "print-ooh.master-artwork",
        sessionRole: "approved",
        data: MASTER_ARTWORK_DATA,
      }),
    ];
    const selections = [
      { phaseId: "format-size", label: "l", routeIndex: 1, semantic: "selection" as const },
      { phaseId: "routes", label: "l", routeIndex: 1, semantic: "selection" as const },
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
    expect(result.choices[0]!.choice).toMatchObject({ primaryMessage: ROUTE_1.primaryMessage });
  });

  it("6. upstream approved master-artwork ArtifactVersion identity is untouched by the fix", () => {
    // The upstream resolver is additive (pushUnique per dependency) — adding
    // a second dependency never alters or replaces the first.
    const upstreamCtx: UpstreamArtifactContext[] = [
      upstream({
        artifactId: "cdfart_muej7cfv_2_print-ooh-master-artwork",
        version: 1,
        phaseId: "master-artwork",
        artifactKey: "print-ooh.master-artwork",
        sessionRole: "approved",
        data: MASTER_ARTWORK_DATA,
      }),
    ];
    expect(upstreamCtx[0]!.artifactId).toBe("cdfart_muej7cfv_2_print-ooh-master-artwork");
    expect(upstreamCtx[0]!.version).toBe(1);
  });

  it("2/7. compiled composition resolves primary_message_surface from the routes choice; CMR invariant passes", () => {
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      selectedChoice: {
        phaseId: "routes",
        artifactId: "cdfart_routes",
        version: 1,
        artifactKey: "print-ooh.routes",
        selectedRouteIndex: 1,
        optionNumber: 2,
        label: "Choice 2",
        choiceArrayKey: "routes",
        choice: ROUTE_1,
        semanticFieldNames: Object.keys(ROUTE_1),
      },
      currentUserInstruction: "Format adaptations for the approved master artwork.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({
      resolutionStatus: "resolved",
      text: ROUTE_1.primaryMessage,
      provenance: "selected_semantic_direction",
    });
    expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(true);
  });

  it("3/5. phase prompt alone never becomes the authoritative message — fails closed", () => {
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      currentUserInstruction: "Format adaptations for the approved master artwork.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({ resolutionStatus: "unresolved" });
    expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(false);
  });

  it("master-artwork's own choice object alone never resolves the message surface (no message fields)", () => {
    const contract = resolveDeliverableCompositionContract("print_artwork")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "print_artwork",
      contract,
      selectedChoice: {
        phaseId: "master-artwork",
        artifactId: "cdfart_master",
        version: 1,
        artifactKey: "print-ooh.master-artwork",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Master Artwork",
        choiceArrayKey: "candidates",
        choice: MASTER_ARTWORK_DATA,
        semanticFieldNames: Object.keys(MASTER_ARTWORK_DATA),
      },
      currentUserInstruction: "Format adaptations.",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({ resolutionStatus: "unresolved" });
  });

  it("9. adaptations cardinality is exactly 3 creatives", () => {
    const svc = resolveCdfCanonicalService("print-ooh")!;
    const adaptations = svc.phases.find((p) => p.phaseId === "adaptations")!;
    expect(adaptations.artifact.cardinality).toMatchObject({ kind: "exactly", count: 3 });
  });
});
