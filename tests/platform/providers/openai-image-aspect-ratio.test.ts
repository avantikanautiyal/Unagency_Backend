import { mapCanonicalToOpenAIRequest } from "../../../src/platform/providers/openai/requests/request-mapper";
import type { ProviderAdapterRequest } from "../../../src/platform/providers/adapters/contracts/adapter-io";

describe("OpenAI image aspect ratio mapping", () => {
  it("maps 16:9 payload aspectRatio to 1536x1024", () => {
    const request = {
      capabilityId: "image.generate",
      modality: "image",
      input: {
        prompt: "Instagram post for DiVastra",
        aspectRatio: "16:9",
      },
      parameters: {},
      features: [],
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-1.5");
    expect(wire.body.size).toBe("1536x1024");
    expect(wire.body.quality).toBe("high");
  });

  it("defaults to square when aspect ratio is unknown", () => {
    const request = {
      capabilityId: "image.generate",
      modality: "image",
      input: { prompt: "Logo mark" },
      parameters: {},
      features: [],
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-1.5");
    expect(wire.body.size).toBe("1024x1024");
  });

  it("maps 4:5 from brief text to portrait OpenAI size", () => {
    const request = {
      capabilityId: "image.generate",
      modality: "image",
      input: {
        prompt:
          "Brand: BloomSip. Size: 1080 x 1350 px, 4:5. CTA: Shop Now.",
      },
      parameters: {},
      features: [],
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-2");
    expect(wire.body.size).toBe("1024x1536");
  });

  it("uses medium quality for route_visual fan-out", () => {
    const request = {
      capabilityId: "image.generate",
      modality: "image",
      input: {
        prompt: "Instagram post for DiVastra",
        productAction: "route_visual",
      },
      parameters: {},
      features: [],
    } as unknown as ProviderAdapterRequest;

    const wire = mapCanonicalToOpenAIRequest(request, "gpt-image-2");
    expect(wire.body.quality).toBe("medium");
  });
});
