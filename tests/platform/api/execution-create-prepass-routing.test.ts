import { resolveClientRoutingPin } from "../../../src/platform/api/services/execution-create-prepass";
import type { CreateExecutionRequest } from "../../../src/platform/api/contracts";

describe("resolveClientRoutingPin", () => {
  it("prefers top-level providerId over metadata", () => {
    const req: CreateExecutionRequest = {
      prompt: "test",
      organizationId: "org_1",
      providerId: "provider.openai",
      modelId: "gpt-image-2",
      metadata: {
        providerId: "provider.google",
        modelId: "gemini-3-pro-image",
      },
    };
    expect(resolveClientRoutingPin(req, req.metadata)).toEqual({
      providerId: "provider.openai",
      modelId: "gpt-image-2",
    });
  });

  it("lifts preferredProviderId from metadata for route fan-out", () => {
    const req: CreateExecutionRequest = {
      prompt: "test",
      organizationId: "org_1",
      metadata: {
        preferredProviderId: "provider.google",
        preferredModelId: "gemini-3-pro-image",
        productAction: "route_visual",
      },
    };
    expect(resolveClientRoutingPin(req, req.metadata)).toEqual({
      providerId: "provider.google",
      modelId: "gemini-3-pro-image",
    });
  });
});
