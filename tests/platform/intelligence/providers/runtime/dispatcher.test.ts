import { PlaceholderProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/placeholder-dispatcher";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { UNCANCELLED_TOKEN } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("PlaceholderProviderDispatcher", () => {
  const dispatcher = new PlaceholderProviderDispatcher({
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });

  it("returns a synthetic response without any provider SDK", async () => {
    const request = sampleRequest();
    const result = await dispatcher.dispatch(request, UNCANCELLED_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.output.placeholder).toBe(true);
      expect(result.value.streamed).toBe(false);
    }
  });

  it("supports streaming and emits chunks", async () => {
    const request = sampleRequest({ streaming: true });
    const chunks: number[] = [];
    expect(dispatcher.supportsStreaming(asProviderId("provider-a"))).toBe(true);
    const result = await dispatcher.dispatchStreaming(
      request,
      UNCANCELLED_TOKEN,
      (c) => chunks.push(c.sequence)
    );
    expect(result.ok).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    if (result.ok) {
      expect(result.value.streamed).toBe(true);
    }
  });
});
