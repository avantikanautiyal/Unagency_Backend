import { PNG } from "pngjs";
import { mapCanonicalToOpenAIRequest } from "../../../../src/platform/providers/openai/requests/request-mapper";
import type { ProviderAdapterRequest } from "../../../../src/platform/providers/adapters/contracts/adapter-io";
import { trimTransparentPng } from "../../../../src/platform/providers/image/common/trim-transparent-png";

function request(metadata: Record<string, unknown>): ProviderAdapterRequest {
  return {
    capabilityId: "image.generate",
    modality: "image",
    input: { prompt: "Flat print graphic", aspectRatio: "3:2" },
    parameters: {},
    features: [],
    metadata,
  } as unknown as ProviderAdapterRequest;
}

describe("merchandise flat artwork", () => {
  it("asks OpenAI for a transparent PNG only when the stage requests it", () => {
    const flat = mapCanonicalToOpenAIRequest(request({ imageBackground: "transparent" }), "gpt-image-1.5");
    const body = flat.body as Record<string, unknown>;
    expect(body.background).toBe("transparent");
    expect(body.output_format).toBe("png");
    const normal = mapCanonicalToOpenAIRequest(request({}), "gpt-image-1.5").body as Record<string, unknown>;
    expect(normal.background).toBeUndefined();
  });

  it("trims a wrap band drawn on a 3:2 canvas to the band's own shape", () => {
    const canvas = new PNG({ width: 300, height: 200 }); // all transparent
    for (let y = 70; y < 130; y++) {
      for (let x = 0; x < 300; x++) {
        const i = (y * 300 + x) * 4;
        canvas.data[i] = 200;
        canvas.data[i + 3] = 255;
      }
    }
    const trimmed = PNG.sync.read(trimTransparentPng(PNG.sync.write(canvas), 0));
    expect(trimmed.width).toBe(300);
    expect(trimmed.height).toBe(60);
  });

  it("leaves opaque images unchanged", () => {
    const opaque = new PNG({ width: 10, height: 10 });
    opaque.data.fill(255);
    const bytes = PNG.sync.write(opaque);
    expect(trimTransparentPng(bytes)).toBe(bytes);
  });
});
