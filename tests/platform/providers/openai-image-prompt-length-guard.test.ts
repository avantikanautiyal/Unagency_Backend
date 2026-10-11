/**
 * Live bug: store-display.posm-design failed with
 * "OpenAI HTTP 400: Invalid 'prompt': string too long. Expected a string
 * with maximum length 32000, but got a string with length 33754 instead."
 *
 * OpenAI's images.generate/images.edit `prompt` param has a hard 32000-char
 * cap. The prompt is fitted section-aware: low-priority context is reduced
 * first, while the instruction, direction, requirements and appended output
 * requirements at the tail survive — a creative is always produced.
 */
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import { fitPromptToBudget } from "../../../src/platform/ai/canonical-model-request/fit-prompt-to-budget";
import type { ProviderAdapterRequest } from "../../../src/platform/providers/adapters/contracts/adapter-io";

function imageRequest(
  requestId: string,
  capabilityId: string,
  input: Record<string, unknown>,
): ProviderAdapterRequest {
  return {
    requestId,
    capabilityId,
    modality: "image",
    input,
    parameters: {},
    features: [],
    metadata: {},
  } as unknown as ProviderAdapterRequest;
}

function wirePrompt(wire: Readonly<Record<string, unknown>>): string {
  return (wire.body as Record<string, unknown>).prompt as string;
}

const labeledPrompt = [
  "===== CURRENT USER INSTRUCTION =====\nLuxury jewellery homepage hero, dark theme.",
  "===== SELECTED SEMANTIC DIRECTIONS =====\nprimaryMessage: Built for the Modern Man",
  "===== REQUIREMENTS =====\n- aspect: 16:9",
  `===== UPSTREAM ARTIFACTS =====\n${'{\n    "page": "home",\n    "sections": ["hero", "collection"]\n}\n'.repeat(600)}`,
  `===== WORKING MEMORY =====\n${"earlier turn about colours\n".repeat(400)}`,
  "===== OUTPUT CONTRACT =====\nSingle UI screen.",
  "===== AUTHORITY =====\nCDF phase contract is authoritative.",
  "\n[Output requirements]\nDeliverable: website UI screen\nFormat: image",
].join("\n\n");

describe("OpenAI image prompt length guard (live bug regression)", () => {
  it("fits an oversized labeled prompt under the cap, keeping essentials and the tail", () => {
    expect(labeledPrompt.length).toBeGreaterThan(32000);
    const wire = mapCanonicalToOpenAIRequest(
      imageRequest("req_test_1", "image.generate", { prompt: labeledPrompt }),
      "gpt-image-1.5",
    );
    const prompt = wirePrompt(wire);
    expect(prompt.length).toBeLessThanOrEqual(32000);
    expect(prompt).toContain("Luxury jewellery homepage hero, dark theme.");
    expect(prompt).toContain("primaryMessage: Built for the Modern Man");
    expect(prompt).toContain("- aspect: 16:9");
    expect(prompt).toContain("Single UI screen.");
    expect(prompt).toContain("[Output requirements]\nDeliverable: website UI screen\nFormat: image");
  });

  it("reduces low-priority context first (upstream artifacts before working memory)", () => {
    const fitted = fitPromptToBudget(labeledPrompt, 32000);
    expect(fitted.report?.middleCut).toBe(false);
    expect(fitted.report?.trimmedSections[0]).toBe("UPSTREAM ARTIFACTS");
    expect(fitted.prompt).toContain("upstream artifacts trimmed to fit model prompt limit");
  });

  it("leaves a prompt at or under the cap completely untouched", () => {
    const exact = "B".repeat(32000);
    const wire = mapCanonicalToOpenAIRequest(
      imageRequest("req_test_2", "image.generate", { prompt: exact }),
      "gpt-image-1.5",
    );
    expect(wirePrompt(wire)).toBe(exact);

    const short = "Instagram post for DiVastra";
    const shortWire = mapCanonicalToOpenAIRequest(
      imageRequest("req_test_3", "image.generate", { prompt: short }),
      "gpt-image-1.5",
    );
    expect(wirePrompt(shortWire)).toBe(short);
  });

  it("keeps head and tail when an unlabeled prompt must be cut (images.edits too)", () => {
    const oversized = `HEAD-INSTRUCTION ${"C".repeat(40000)} TAIL-REQUIREMENTS`;
    const wire = mapCanonicalToOpenAIRequest(
      imageRequest("req_test_4", "image.edit", {
        prompt: oversized,
        referenceImages: [],
      }),
      "gpt-image-1.5",
    );
    const prompt = wirePrompt(wire);
    expect(prompt.length).toBeLessThanOrEqual(32000);
    expect(prompt).toContain("HEAD-INSTRUCTION");
    expect(prompt).toContain("TAIL-REQUIREMENTS");
  });
});
