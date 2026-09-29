/**
 * Live bug (Ad Campaigns / Performance Ads master-kv):
 * CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT before provider invocation
 * (providerInvoked=false), despite healthy upstream:
 *   big-ideas@1 selected routes[2]
 *   → campaign-development@1 approved
 *   → master-kv loaded campaign-development@1
 *
 * Root cause (same shape as packaging front-pack / print-ooh adaptations):
 * master-kv declared only `campaign-development` as a dependency.
 * campaign-development's structured/text data has NO rendered-communication
 * fields — it is the concept-prose authority, not the message authority.
 * Exact on-asset fields (primaryMessage/headlineAngle/…) live on the SELECTED
 * big-ideas direction, which master-kv never declared a dependency on, so
 * resolveSelectedSemanticChoices had no upstream entry to resolve the
 * session's big-ideas selection against.
 *
 * Fix: master-kv (and channel-executions, same campaign_kv CMR contract)
 * declare `big-ideas` alongside the production-authority dependency — the
 * same generic dependency mechanism already used elsewhere. No runtime
 * service/phase branch, no chat-text fallback, no phase-prompt authority.
 */

import {
  resolveDeliverableCompositionContract,
  requiredExactRenderedCommunicationElements,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { resolveCdfCanonicalService } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/registry";
import {
  resolveSelectedSemanticChoices,
  selectSemanticChoiceForComposition,
} from "../../../src/platform/cdf/generation-context/resolve-selected-choice";
import type { UpstreamArtifactContext } from "../../../src/platform/cdf/generation-context/types";
import { compileDeliverableComposition } from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { assertRequiredCommunicationValuesResolved } from "../../../src/platform/cdf/generation-context/composition-authority";

/** Exact live shape of routes[2] on cdfart_*_ad-campaigns-big-ideas@1 (values genericized). */
const BIG_IDEA_ROUTE_2 = {
  name: "Everyday Voltage",
  creativeIdea: "Frame the drink as a daily ignition ritual.",
  visualTreatment: "High-contrast kinetic still life.",
  visualDirection: "Product as hero under sharp rim light.",
  headlineAngle: "Ignite the ordinary",
  rationale: "Makes energy feel habitual, not extreme.",
  composition: "Product left-third, type right-third, negative space.",
  hierarchy: "Headline, product, brand mark, proof line.",
  communicationObjective:
    "Position the drink as the everyday ignition that turns routine into momentum.",
  primaryMessage: "Ignite the ordinary",
  secondaryMessage: "Energy for the days that fill your calendar",
  visualConcept: "Kinetic still life — can catching a spark of daylight.",
  focalPoint: "Can mouth / condensation bead where light hits.",
  typographyDirection: "Bold condensed sans, tight tracking.",
  supportingVisualElements: "Subtle motion streak, desk props.",
  brandIntegration: "Mark sits under headline, never competing with product.",
  identityMarkRole: "Secondary lockup — signature, not hero.",
  audienceSignal: "Young professionals between meetings.",
  useContextIntent: "Morning desk / mid-day reset.",
  avoidances: "Gym-bro extreme sports clichés.",
  shelfIdea: "n/a for campaign KV",
  designRationale: "Clarity under social crop.",
  hierarchyThought: "Message first, product second, mark third.",
};

/** Live campaign-development shape — concept prose, no RRC message fields. */
const CAMPAIGN_DEVELOPMENT_DATA = {
  artifactKey: "ad-campaigns.campaign-development",
  title: "Campaign concept development",
  body:
    "Develop Everyday Voltage into a master key visual: product as ignition, headline as ritual.",
  summary: "Concept prose for the selected big idea — not on-asset copy.",
};

function upstream(over: Partial<UpstreamArtifactContext>): UpstreamArtifactContext {
  return {
    artifactId: "cdfart_x",
    version: 1,
    artifactKey: "ad-campaigns.x",
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

describe("ad-campaigns master-kv — communication surface source (live bug regression)", () => {
  it("1. registry declares big-ideas as a master-kv dependency (the message authority)", () => {
    const svc = resolveCdfCanonicalService("ad-campaigns")!;
    const masterKv = svc.phases.find((p) => p.phaseId === "master-kv")!;
    const depIds = masterKv.dependencies.map((d) => d.phaseId);
    expect(depIds).toContain("campaign-development");
    expect(depIds).toContain("big-ideas");
  });

  it("master-kv (campaign_kv) requires an exact-message primary_message_surface", () => {
    const contract = resolveDeliverableCompositionContract("campaign_kv")!;
    expect(requiredExactRenderedCommunicationElements(contract)).toContain(
      "primary_message_surface",
    );
  });

  it("2. resolveSelectedSemanticChoices resolves the BIG-IDEAS selection, not campaign-development (no message fields)", () => {
    const upstreamCtx: UpstreamArtifactContext[] = [
      upstream({
        artifactId: "cdfart_muhlcjv7_2_ad-campaigns-big-ideas",
        version: 1,
        phaseId: "big-ideas",
        artifactKey: "ad-campaigns.big-ideas",
        sessionRole: "selected",
        data: {
          schemaId: "CdfCreativeDirections",
          routes: [{}, {}, BIG_IDEA_ROUTE_2],
        },
      }),
      upstream({
        artifactId: "cdfart_muhle0xm_3_ad-campaigns-campaign-development",
        version: 1,
        phaseId: "campaign-development",
        artifactKey: "ad-campaigns.campaign-development",
        sessionRole: "approved",
        data: CAMPAIGN_DEVELOPMENT_DATA,
      }),
    ];
    const selections = [
      {
        phaseId: "big-ideas",
        label: "Route 3",
        routeIndex: 2,
        semantic: "selection" as const,
      },
    ];
    const result = resolveSelectedSemanticChoices({
      selections,
      upstream: upstreamCtx,
      failClosed: true,
      requirePhaseIds: ["big-ideas"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.phaseId).toBe("big-ideas");
    expect(result.choices[0]!.artifactId).toBe(
      "cdfart_muhlcjv7_2_ad-campaigns-big-ideas",
    );
    expect(result.choices[0]!.version).toBe(1);
    expect(result.choices[0]!.selectedRouteIndex).toBe(2);
    expect(result.choices[0]!.choice).toMatchObject({
      primaryMessage: BIG_IDEA_ROUTE_2.primaryMessage,
    });
  });

  it("3. selectSemanticChoiceForComposition prefers the communication-bearing big-ideas slice over empty/prose parents", () => {
    const preferred = selectSemanticChoiceForComposition([
      {
        phaseId: "campaign-development",
        artifactId: "cdfart_muhle0xm_3_ad-campaigns-campaign-development",
        version: 1,
        artifactKey: "ad-campaigns.campaign-development",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Concept",
        choiceArrayKey: "(root)",
        choice: CAMPAIGN_DEVELOPMENT_DATA,
        semanticFieldNames: Object.keys(CAMPAIGN_DEVELOPMENT_DATA),
      },
      {
        phaseId: "big-ideas",
        artifactId: "cdfart_muhlcjv7_2_ad-campaigns-big-ideas",
        version: 1,
        artifactKey: "ad-campaigns.big-ideas",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "Route 3",
        choiceArrayKey: "routes",
        choice: BIG_IDEA_ROUTE_2,
        semanticFieldNames: Object.keys(BIG_IDEA_ROUTE_2),
      },
    ]);
    expect(preferred?.phaseId).toBe("big-ideas");
    expect(preferred?.choice.primaryMessage).toBe(
      BIG_IDEA_ROUTE_2.primaryMessage,
    );
  });

  it("4. compiled composition resolves primary_message_surface from the big-ideas choice; CMR passes; no chat/last-runtime", () => {
    const contract = resolveDeliverableCompositionContract("campaign_kv")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "campaign_kv",
      contract,
      selectedChoice: {
        phaseId: "big-ideas",
        artifactId: "cdfart_muhlcjv7_2_ad-campaigns-big-ideas",
        version: 1,
        artifactKey: "ad-campaigns.big-ideas",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "Route 3",
        choiceArrayKey: "routes",
        choice: BIG_IDEA_ROUTE_2,
        semanticFieldNames: Object.keys(BIG_IDEA_ROUTE_2),
      },
      // Phase prompt — must NOT become the authoritative on-asset message.
      currentUserInstruction: "Master key visual:",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
      artifactKey: "ad-campaigns.master-kv",
      phaseName: "Master KV",
    });

    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({
      resolutionStatus: "resolved",
      text: BIG_IDEA_ROUTE_2.primaryMessage,
      provenance: "selected_semantic_direction",
    });
    expect(compiled.requiredRenderedCommunication.allRequiredResolved).toBe(
      true,
    );
    expect(
      assertRequiredCommunicationValuesResolved({ contract, compiled }).ok,
    ).toBe(true);
    // No filled slot sourced from phase_prompt for required RRC.
    expect(
      compiled.filledSlots.some(
        (s) =>
          s.element === "primary_message_surface" &&
          s.source === "phase_prompt",
      ),
    ).toBe(false);
  });

  it("5. negative — empty required primaryMessage still fails CMR with that surface identified", () => {
    const contract = resolveDeliverableCompositionContract("campaign_kv")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "campaign_kv",
      contract,
      selectedChoice: {
        phaseId: "big-ideas",
        artifactId: "cdfart_muhlcjv7_2_ad-campaigns-big-ideas",
        version: 1,
        artifactKey: "ad-campaigns.big-ideas",
        selectedRouteIndex: 2,
        optionNumber: 3,
        label: "Route 3",
        choiceArrayKey: "routes",
        choice: {
          ...BIG_IDEA_ROUTE_2,
          primaryMessage: "",
          headlineAngle: "",
          communicationObjective: "",
          messaging: "",
        },
        semanticFieldNames: ["name", "creativeIdea"],
      },
      currentUserInstruction: "Master key visual:",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const check = assertRequiredCommunicationValuesResolved({
      contract,
      compiled,
    });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.code).toBe("CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT");
    expect(check.details.unresolvedElements).toEqual(
      expect.arrayContaining(["primary_message_surface"]),
    );
    const surfaces = check.details.surfaces as Array<Record<string, unknown>>;
    expect(
      surfaces.find((s) => s.element === "primary_message_surface"),
    ).toMatchObject({
      resolutionStatus: "unresolved",
      textLength: 0,
    });
  });

  it("6. campaign-development alone (no big-ideas choice) never satisfies CMR via phase prompt", () => {
    const contract = resolveDeliverableCompositionContract("campaign_kv")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "campaign_kv",
      contract,
      selectedChoice: {
        phaseId: "campaign-development",
        artifactId: "cdfart_muhle0xm_3_ad-campaigns-campaign-development",
        version: 1,
        artifactKey: "ad-campaigns.campaign-development",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "Concept",
        choiceArrayKey: "(root)",
        choice: CAMPAIGN_DEVELOPMENT_DATA,
        semanticFieldNames: Object.keys(CAMPAIGN_DEVELOPMENT_DATA),
      },
      currentUserInstruction: "Master key visual:",
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    const check = assertRequiredCommunicationValuesResolved({
      contract,
      compiled,
    });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.details.unresolvedElements).toEqual(
      expect.arrayContaining(["primary_message_surface"]),
    );
  });
});
