/**
 * Live bug: store-display.posm-design failed with
 * "OpenAI HTTP 400: Invalid 'prompt': string too long. Expected a string
 * with maximum length 32000, but got a string with length 33754 instead."
 *
 * OpenAI's images.generate/images.edit `prompt` param has a hard 32000-char
 * cap. Nothing in the canonical→OpenAI image mapping enforced it — any
 * image phase whose compiled canonical prompt (brand context + composition
 * requirements + upstream refs) crosses that length fails the same way,
 * not just POSM. Fix is provider-boundary-scoped (request-mapper), not
 * phase-specific: truncate to fit and log loudly so it stays diagnosable.
 */
import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import type { ProviderAdapterRequest } from "../../../src/platform/providers/adapters/contracts/adapter-io";

describe("OpenAI image prompt length guard (live bug regression)", () => {
  it("truncates an oversized images.generate prompt to OpenAI's documented 32000-char cap", () => {
    const oversized = "A".repeat(33754);
    const request = {
      requestId: "req_test_1",
      capabilityId: "image.generate",
      modality: "image",
      input: { prompt: oversized },
      parameters: {},
      features: [],
      metadata: {},
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-1.5");
    expect(typeof wire.body.prompt).toBe("string");
    expect((wire.body.prompt as string).length).toBe(32000);
  });

  it("leaves a prompt at or under the cap completely untouched", () => {
    const exact = "B".repeat(32000);
    const request = {
      requestId: "req_test_2",
      capabilityId: "image.generate",
      modality: "image",
      input: { prompt: exact },
      parameters: {},
      features: [],
      metadata: {},
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-1.5");
    expect(wire.body.prompt).toBe(exact);

    const short = "Instagram post for DiVastra";
    const shortRequest = {
      requestId: "req_test_3",
      capabilityId: "image.generate",
      modality: "image",
      input: { prompt: short },
      parameters: {},
      features: [],
      metadata: {},
    } as unknown as ProviderAdapterRequest;
    const shortWire = mapCanonicalToOpenAIRequest(shortRequest, "gpt-image-1.5");
    expect(shortWire.body.prompt).toBe(short);
  });

  it("also guards images.edits (reference-image role prompt), not just images.generations", () => {
    const oversized = "C".repeat(40000);
    const request = {
      requestId: "req_test_4",
      capabilityId: "image.edit",
      modality: "image",
      input: {
        prompt: oversized,
        referenceImages: [],
      },
      parameters: {},
      features: [],
      metadata: {},
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-1.5");
    expect((wire.body.prompt as string).length).toBeLessThanOrEqual(32000);
  });
});
