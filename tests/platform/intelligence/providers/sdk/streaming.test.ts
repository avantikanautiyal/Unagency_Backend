import { DefaultSdkStreamingEngine } from "../../../../../src/platform/intelligence/providers/sdk/streaming/default-streaming-engine";
import { asSdkExecutionId } from "../../../../../src/platform/intelligence/providers/sdk/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";
import type { SdkExecutionContext } from "../../../../../src/platform/intelligence/providers/sdk/contracts/context";

const context: SdkExecutionContext = {
  executionId: asSdkExecutionId("exec_1"),
  requestId: "req_1",
  providerId: asProviderId("provider.test"),
  vendor: "openai",
  attributes: {},
  startedAt: "2026-01-01T00:00:00.000Z",
};

describe("SDK streaming engine", () => {
  const engine = new DefaultSdkStreamingEngine(() => "2026-01-01T00:00:00.000Z");

  it("normalizes chunks and partial responses", () => {
    const chunk = engine.normalizeChunk({ content: "hi" }, context, 0);
    expect(chunk.ok).toBe(true);
    if (!chunk.ok) return;
    expect(chunk.value.kind).toBe("chunk");

    const partial = engine.partial({ delta: "x" }, context, 1);
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.value.kind).toBe("partial");
  });

  it("emits complete and error markers", () => {
    const complete = engine.complete(context, 2);
    expect(complete.ok && complete.value.done).toBe(true);

    const error = engine.error("boom", context, 3);
    expect(error.ok).toBe(true);
    if (error.ok) {
      expect(error.value.kind).toBe("error");
      expect(error.value.data.message).toBe("boom");
    }
  });
});
