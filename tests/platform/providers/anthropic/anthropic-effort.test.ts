/**
 * Short text steps send output_config.effort "low" — only to models that
 * accept it (Sonnet 4.5 / Haiku 4.5 return an error for effort).
 */
import { mapCanonicalToAnthropicRequest } from "../../../../src/platform/providers/anthropic/requests/request-mapper";
import { sampleRequest } from "../../../../src/platform/providers/runtime/testing";
import { toAdapterRequestFromExecution } from "../../../../src/platform/providers/common/to-adapter-request";

function wireFor(model: string, options: Record<string, unknown>) {
  const adapterReq = toAdapterRequestFromExecution({
    request: {
      ...sampleRequest({
        requestId: "eff",
        providerId: "provider.anthropic",
        payload: { prompt: "Three route ideas", messages: [{ role: "user", content: "Three route ideas" }] },
      }),
      capabilityId: "text.generate",
      modelId: `anthropic/${model}`,
      options,
    } as never,
    canonicalProviderId: "provider.anthropic",
    adapterId: "anthropic",
    nowIso: new Date().toISOString(),
  });
  return mapCanonicalToAnthropicRequest(adapterReq, model).body as Record<string, unknown>;
}

describe("anthropic effort", () => {
  it("sends low effort to Claude 5 models", () => {
    expect(wireFor("claude-opus-5-5", { reasoningEffort: "low" }).output_config).toEqual({ effort: "low" });
  });
  it("never sends effort to Sonnet 4.5 (it rejects the field)", () => {
    expect(wireFor("claude-sonnet-4-5", { reasoningEffort: "low" }).output_config).toBeUndefined();
  });
  it("no effort unless asked", () => {
    expect(wireFor("claude-opus-5-5", {}).output_config).toBeUndefined();
  });
});
