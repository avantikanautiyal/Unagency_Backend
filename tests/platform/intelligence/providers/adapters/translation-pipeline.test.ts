import {
  FakeTextAdapter,
  fixedNow,
  makeNegotiatedExecution,
  setupAdapterPlatform,
  TEST_ADAPTER_ID,
} from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { DefaultRequestTranslator } from "../../../../../src/platform/intelligence/providers/adapters/requests/default-request-translator";

describe("Translation pipeline", () => {
  it("prepares a canonical request + opaque wire payload from a NegotiatedExecution", () => {
    const { platform } = setupAdapterPlatform();

    const prepared = platform.engine.prepare({
      negotiated: makeNegotiatedExecution(),
      input: { messages: [{ role: "user", content: "hi" }] },
      parameters: { temperature: 0.2 },
    });
    if (!prepared.ok) throw prepared.error;

    expect(prepared.value.adapterRequest.modelId).toBe("test-model");
    expect(prepared.value.adapterRequest.providerId).toBe(
      makeNegotiatedExecution().selectedProviderId
    );
    // wire payload is a plain provider-shaped map (identity fake mapping)
    expect(prepared.value.wirePayload.model).toBe("test-model");
    expect(prepared.value.wirePayload.temperature).toBe(0.2);
  });

  it("warns (via the request translator) when the model is not in the manifest", () => {
    const translator = new DefaultRequestTranslator(fixedNow, (p) => `${p}_x`);
    const descriptor = new FakeTextAdapter().describe();
    const result = translator.toAdapterRequest(
      {
        negotiated: makeNegotiatedExecution({ selectedModelId: "unknown-model" }),
        input: {},
      },
      descriptor
    );
    if (!result.ok) throw result.error;
    expect(
      result.value.warnings.some((w) => w.code === "model_not_in_manifest")
    ).toBe(true);
  });

  it("rejects preparation when the negotiated model is unknown (validation)", () => {
    const { platform } = setupAdapterPlatform();
    const prepared = platform.engine.prepare({
      negotiated: makeNegotiatedExecution({ selectedModelId: "unknown-model" }),
      input: {},
    });
    expect(prepared.ok).toBe(false);
  });

  it("finalizes a raw wire response into a canonical runtime response", () => {
    const { platform } = setupAdapterPlatform();
    const prepared = platform.engine.prepare({
      negotiated: makeNegotiatedExecution(),
      input: { messages: [] },
    });
    if (!prepared.ok) throw prepared.error;

    const finalized = platform.engine.finalize({
      adapterId: TEST_ADAPTER_ID,
      request: prepared.value.adapterRequest,
      raw: {
        content: "hello",
        finish_reason: "stop",
        usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
      },
      latencyMs: 42,
    });
    if (!finalized.ok) throw finalized.error;

    expect(finalized.value.requestId).toBe(prepared.value.adapterRequest.requestId);
    expect(finalized.value.output.content).toBe("hello");
    expect(finalized.value.usage?.promptTokens).toBe(10);
  });

  it("fails to prepare when no adapter is registered for the provider", () => {
    const { platform } = setupAdapterPlatform();
    platform.registry.remove(TEST_ADAPTER_ID);
    const prepared = platform.engine.prepare({
      negotiated: makeNegotiatedExecution(),
      input: {},
    });
    expect(prepared.ok).toBe(false);
  });
});
