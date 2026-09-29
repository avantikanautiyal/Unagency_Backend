/**
 * Rendered-communication value authority — expected on-asset text comes only
 * from contract elements declaring an exact message, never from the (framework
 * composed) phase prompt. Structural results stay observational.
 *
 * Fixture instruction/OCR mirror live exec_172_1790149766439 (logo-system).
 */

import {
  resolveDeliverableCompositionContract,
  requiredExactRenderedCommunicationElements,
  renderedCommunicationAuthority,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { compileDeliverableComposition } from "../../../src/platform/cdf/generation-context/compile-deliverable-composition";
import { assertRequiredCommunicationValuesResolved } from "../../../src/platform/cdf/generation-context/composition-authority";
import { deriveVisualVerificationRequirements } from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import {
  evaluateStructuralCompositionCompliance,
  expectedTextsFromCanonicalModelRequest,
} from "../../../src/platform/cdf/generation-validation/structural-composition-validation";

const EXEC_172_PHASE_PROMPT = [
  "Create a logo for my brand, use the brand colours and make it luxurious",
  "Selected direction: Choice 2 — Modern Opulence",
  "Deliverable: Logo System",
  "Create a finished Logo System for the selected brand. Output modality: image.",
].join("\n\n");

const EXEC_172_OCR =
  "PRIMARY MARK COLOR PALETTE\n#FFA500\nCONSTRUCTION & PROPORTIONS TREATMENTS\nY + VOYLA\nREVERSE ALTERNATE MONOCHROME\nVOYLA | vovYLA\nAPPLICATIONS";

function ocr(text: string) {
  return { extractedText: text, source: "ocr" as const, outcome: "ok" as const, confidence: 0.7 };
}

function logoSystem() {
  const contract = resolveDeliverableCompositionContract("logo_system")!;
  const compiled = compileDeliverableComposition({
    deliverableKind: "logo_system",
    contract,
    currentUserInstruction: EXEC_172_PHASE_PROMPT,
    brandContext: { brandName: "VOYLA" } as never,
    generationModality: "image",
  });
  return { contract, compiled, vreqs: deriveVisualVerificationRequirements(contract) };
}

function criterion(result: ReturnType<typeof evaluateStructuralCompositionCompliance>, id: string) {
  return result.criteria.find((c) => c.criterionId === id);
}

describe("logo_system contract — model-authored on-asset text", () => {
  it("contract declares sheet labels model_authored; no exact-message element", () => {
    const { contract } = logoSystem();
    expect(renderedCommunicationAuthority(contract, "primary_message_surface")).toBe(
      "model_authored",
    );
    expect(requiredExactRenderedCommunicationElements(contract)).toEqual([]);
    // Text is still required on the asset.
    expect(contract.textPolicy).toEqual({ placement: "on_asset", required: true });
  });

  it("phase prompt is never promoted to an on-asset surface value", () => {
    const { compiled } = logoSystem();
    const rrc = compiled.requiredRenderedCommunication;
    expect(rrc.active).toBe(true);
    expect(rrc.surfaces).toEqual([]);
    expect(rrc.modelAuthoredElements).toEqual(["primary_message_surface"]);
    expect(
      compiled.filledSlots.some(
        (s) => s.element === "primary_message_surface" && s.source === "user_instruction",
      ),
    ).toBe(false);
  });

  it("generation is not fail-closed (value integrity holds without an exact value)", () => {
    const { contract, compiled } = logoSystem();
    expect(assertRequiredCommunicationValuesResolved({ contract, compiled }).ok).toBe(true);
  });

  it("verification: presence required, no rendered_text_match derived", () => {
    const { vreqs } = logoSystem();
    const ids = vreqs!.criteria.map((c) => c.id);
    expect(ids).toContain("rendered_text_presence");
    expect(ids).not.toContain("rendered_text_match");
  });

  it("A — exec_172 OCR (labels + VOYLA): presence COMPLIANT, no prompt-based match", () => {
    const { contract, vreqs } = logoSystem();
    const r = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { renderedTextProof: ocr(EXEC_172_OCR) },
      verificationRequirements: vreqs,
    });
    expect(criterion(r, "rendered_text_presence")?.status).toBe("COMPLIANT");
    expect(criterion(r, "rendered_text_match")).toBeUndefined();
    expect(r.failedRequirements).not.toContain("rendered_text_match");
  });

  it("B — no text rendered: missing on-asset text is identified", () => {
    const { contract, vreqs } = logoSystem();
    const r = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { renderedTextProof: ocr("") },
      verificationRequirements: vreqs,
    });
    expect(criterion(r, "rendered_text_presence")?.status).toBe("NON_COMPLIANT");
    expect(r.status).toBe("NON_COMPLIANT");
  });

  it("C — unrelated text cannot satisfy an exact requirement the contract never declares", () => {
    const { contract, vreqs } = logoSystem();
    const r = evaluateStructuralCompositionCompliance({
      contract,
      evidence: {
        renderedTextProof: ocr("LOREM IPSUM SAMPLE"),
        // Even if a stale stamp supplies an expected text, no match criterion
        // exists for a model_authored contract — nothing to satisfy or fake.
        expectedRenderedTexts: [EXEC_172_PHASE_PROMPT],
      },
      verificationRequirements: vreqs,
    });
    expect(criterion(r, "rendered_text_match")).toBeUndefined();
  });
});

describe("exact-message contracts keep existing behavior", () => {
  const MESSAGE = "Welcome to Acme — learning that grows with every child.";

  function social() {
    const contract = resolveDeliverableCompositionContract("social_creative")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract,
      selectedChoice: {
        phaseId: "routes",
        artifactId: "a",
        version: 1,
        artifactKey: "k",
        selectedRouteIndex: 0,
        optionNumber: 1,
        label: "r",
        choiceArrayKey: "routes",
        choice: { primaryMessage: MESSAGE, visualConcept: "Warm scene" },
        semanticFieldNames: ["primaryMessage", "visualConcept"],
      },
      currentUserInstruction: "Make it warm",
      generationModality: "image",
    });
    return { contract, compiled, vreqs: deriveVisualVerificationRequirements(contract) };
  }

  it("D — exact surface resolved from direction; match derived and enforced", () => {
    const { contract, compiled, vreqs } = social();
    const surface = compiled.requiredRenderedCommunication.surfaces.find(
      (s) => s.element === "primary_message_surface",
    );
    expect(surface).toMatchObject({ resolutionStatus: "resolved", text: MESSAGE });
    expect(vreqs!.criteria.find((c) => c.id === "rendered_text_match")?.relatedElements).toContain(
      "primary_message_surface",
    );

    const present = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { renderedTextProof: ocr(MESSAGE.toUpperCase()), expectedRenderedTexts: [MESSAGE] },
      verificationRequirements: vreqs,
    });
    expect(criterion(present, "rendered_text_match")?.status).toBe("COMPLIANT");

    const missing = evaluateStructuralCompositionCompliance({
      contract,
      evidence: { renderedTextProof: ocr("SUMMER SALE"), expectedRenderedTexts: [MESSAGE] },
      verificationRequirements: vreqs,
    });
    expect(criterion(missing, "rendered_text_match")?.status).toBe("NON_COMPLIANT");
  });

  it("E — no required on-asset text: no surface, no match, prompt never becomes expected text", () => {
    const contract = resolveDeliverableCompositionContract("logo")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "logo",
      contract,
      currentUserInstruction: EXEC_172_PHASE_PROMPT,
      generationModality: "image",
    });
    expect(compiled.requiredRenderedCommunication.active).toBe(false);
    expect(compiled.requiredRenderedCommunication.surfaces).toEqual([]);
    const ids = (deriveVisualVerificationRequirements(contract)?.criteria ?? []).map((c) => c.id);
    expect(ids).not.toContain("rendered_text_match");
  });
});

describe("required rendered communication — source precedence (A/B/C/D)", () => {
  const MESSAGE = "Fresh from the garden — 20% off this week";
  const contract = () => resolveDeliverableCompositionContract("social_creative")!;
  const choice = (fields: Record<string, unknown>) => ({
    phaseId: "routes",
    artifactId: "a",
    version: 1,
    artifactKey: "k",
    selectedRouteIndex: 0,
    optionNumber: 1,
    label: "r",
    choiceArrayKey: "routes",
    choice: { visualConcept: "Garden scene", ...fields },
    semanticFieldNames: ["visualConcept", ...Object.keys(fields)],
  });
  const cmrOf = (compiled: ReturnType<typeof compileDeliverableComposition>) => ({
    messages: [{ role: "user", content: [{ type: "structured", name: "deliverable_composition", data: compiled }] }],
  });
  const primary = (compiled: ReturnType<typeof compileDeliverableComposition>) =>
    compiled.requiredRenderedCommunication.surfaces.find((s) => s.element === "primary_message_surface");

  it("A — authoritative exact message supplied → resolved surface + OCR requirement", () => {
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract: contract(),
      selectedChoice: choice({ primaryMessage: MESSAGE }),
      currentUserInstruction: EXEC_172_PHASE_PROMPT,
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    expect(primary(compiled)).toMatchObject({ resolutionStatus: "resolved", text: MESSAGE, provenance: "selected_semantic_direction" });
    expect(expectedTextsFromCanonicalModelRequest(cmrOf(compiled))).toEqual([MESSAGE]);
  });

  it("no exact message + phase prompt only (D) → unresolved; fails closed; never invents OCR text", () => {
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract: contract(),
      selectedChoice: choice({}),
      currentUserInstruction: EXEC_172_PHASE_PROMPT,
      currentUserInstructionAuthority: "phase_prompt",
      generationModality: "image",
    });
    expect(primary(compiled)).toMatchObject({ resolutionStatus: "unresolved" });
    expect(assertRequiredCommunicationValuesResolved({ contract: contract(), compiled }).ok).toBe(false);
    expect(expectedTextsFromCanonicalModelRequest(cmrOf(compiled))).toEqual([]);
    const intent = compiled.filledSlots.find((s) => s.element === "user_intent");
    expect(intent?.source).toBe("phase_prompt");
  });

  it("C — conversational instruction only → guides generation, but is not an exact OCR requirement", () => {
    const instruction = "Put our summer sale on it";
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract: contract(),
      selectedChoice: choice({}),
      currentUserInstruction: instruction,
      currentUserInstructionAuthority: "user_instruction",
      generationModality: "image",
    });
    expect(primary(compiled)).toMatchObject({ resolutionStatus: "resolved", text: instruction, provenance: "current_user_instruction" });
    expect(assertRequiredCommunicationValuesResolved({ contract: contract(), compiled }).ok).toBe(true);
    expect(expectedTextsFromCanonicalModelRequest(cmrOf(compiled))).toEqual([]);
  });

  it("A wins over C when both exist", () => {
    const compiled = compileDeliverableComposition({
      deliverableKind: "social_creative",
      contract: contract(),
      selectedChoice: choice({ primaryMessage: MESSAGE }),
      currentUserInstruction: "Put our summer sale on it",
      generationModality: "image",
    });
    expect(primary(compiled)).toMatchObject({ text: MESSAGE, provenance: "selected_semantic_direction" });
  });

  it("B — model-authored text: no surface, no OCR string, even with a user instruction", () => {
    const c = resolveDeliverableCompositionContract("logo_system")!;
    const compiled = compileDeliverableComposition({
      deliverableKind: "logo_system",
      contract: c,
      currentUserInstruction: "Make the labels say PREMIUM",
      currentUserInstructionAuthority: "user_instruction",
      generationModality: "image",
    });
    expect(compiled.requiredRenderedCommunication.surfaces).toEqual([]);
    expect(expectedTextsFromCanonicalModelRequest(cmrOf(compiled))).toEqual([]);
  });

  it("non-visual / no-composition request → no expected on-asset text", () => {
    expect(
      expectedTextsFromCanonicalModelRequest({
        messages: [{ role: "user", content: [{ type: "text", text: EXEC_172_PHASE_PROMPT, semanticRole: "current_user_instruction" }] }],
      }),
    ).toEqual([]);
  });
});

