import {
  fixedNow,
  makeNegotiatedExecution,
  setupAdapterPlatform,
  TEST_ADAPTER_ID,
} from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { DefaultResponseNormalizer } from "../../../../../src/platform/intelligence/providers/adapters/normalization/default-response-normalizer";
import { DefaultProviderErrorTranslator } from "../../../../../src/platform/intelligence/providers/adapters/errors/error-translator";
import type { ProviderAdapterRequest } from "../../../../../src/platform/intelligence/providers/adapters/contracts/adapter-io";

const request: ProviderAdapterRequest = {
  requestId: "r1",
  providerId: makeNegotiatedExecution().selectedProviderId,
  adapterId: TEST_ADAPTER_ID,
  modelId: "test-model",
  modality: "text",
  input: {},
  parameters: {},
  features: [],
  streaming: false,
  timeoutMs: 30_000,
  metadata: {},
  createdAt: fixedNow(),
};

describe("Response normalization", () => {
  const normalizer = new DefaultResponseNormalizer(fixedNow);

  it("canonicalizes finish reasons, usage, safety, and reasoning", () => {
    const result = normalizer.normalize(
      {
        content: "hi",
        stop_reason: "end_turn",
        usage: { input_tokens: 7, output_tokens: 2 },
        safety: [{ category: "violence", flagged: true, score: 0.9 }],
        reasoning: { steps: 3 },
      },
      request
    );
    if (!result.ok) throw result.error;
    const r = result.value.response;
    expect(r.finishReason).toBe("stop");
    expect(r.usage?.promptTokens).toBe(7);
    expect(r.usage?.completionTokens).toBe(2);
    expect(r.safety[0]?.flagged).toBe(true);
    expect(r.reasoning?.steps).toBe(3);
  });

  it("defaults unknown finish reasons and emits a warning", () => {
    const result = normalizer.normalize({ content: "x" }, request);
    if (!result.ok) throw result.error;
    expect(result.value.response.finishReason).toBe("unknown");
    expect(result.value.warnings.some((w) => w.code === "finish_reason_missing")).toBe(true);
  });

  it("marks streamed responses with streaming metadata", () => {
    const result = normalizer.normalize(
      { content: "x", streamed: true, streaming: { chunkCount: 4 } },
      request
    );
    if (!result.ok) throw result.error;
    expect(result.value.response.streamed).toBe(true);
    expect(result.value.response.streaming?.chunkCount).toBe(4);
  });
});

describe("Error translation", () => {
  const translator = new DefaultProviderErrorTranslator();

  it("classifies rate limit errors as retryable", () => {
    const error = translator.normalize({ status: 429, message: "too many requests" });
    expect(error.kind).toBe("rate_limit");
    expect(error.retryable).toBe(true);
  });

  it("classifies authentication errors", () => {
    expect(translator.normalize({ status: 401 }).kind).toBe("authentication");
    expect(translator.normalize({ status: 403 }).kind).toBe("authorization");
  });

  it("classifies timeout and content policy from message text", () => {
    expect(translator.normalize(new Error("request timed out")).kind).toBe("timeout");
    expect(translator.normalize("content policy violation").kind).toBe("content_policy");
  });

  it("is idempotent for already-canonical errors", () => {
    const canonical = translator.normalize({ status: 503 });
    expect(canonical.kind).toBe("unavailable");
    expect(translator.normalize(canonical)).toBe(canonical);
  });

  it("routes adapter-level errors through the engine", () => {
    const { platform } = setupAdapterPlatform();
    const error = platform.engine.translateError(TEST_ADAPTER_ID, { status: 500 });
    expect(error.kind).toBe("provider_internal");
  });
});
