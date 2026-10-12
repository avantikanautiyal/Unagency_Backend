/**
 * Automatic retries of a text step must not call the same provider again.
 */

import { TextExecutionRouter } from "../../../src/platform/providers/routing/text/text-execution-router";

function router(available: string[]) {
  const registry = {
    listAvailableProviderIds: () => available,
    resolveAvailable: (id: string) =>
      available.includes(id) ? { capabilities: ["text.generate"] } : undefined,
  };
  return new TextExecutionRouter(registry as never);
}

describe("TextExecutionRouter — retry rotation", () => {
  const all = ["provider.openai", "provider.anthropic", "provider.gemini", "provider.deepseek"];

  it("uses a different provider on each automatic attempt", () => {
    const r = router(all);
    const pick = (attempt?: number) => {
      const out = r.resolve({
        prompt: "Write three creative directions for a tea brand launch",
        metadata: attempt ? { cdfQualityAttempt: attempt } : {},
      });
      if (!out.ok) throw new Error("no route");
      return out.value.providerId;
    };
    const first = pick();
    expect(pick(1)).toBe(first);
    const second = pick(2);
    const third = pick(3);
    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it("rotates away from a pinned provider on retry", () => {
    const r = router(all);
    const out = r.resolve({
      prompt: "Write copy",
      preferredProviderId: "provider.openai",
      metadata: { cdfQualityAttempt: 2 },
    });
    expect(out.ok && out.value.providerId).not.toBe("provider.openai");
  });

  it("stays on the only provider when no alternative is configured", () => {
    const r = router(["provider.openai"]);
    const out = r.resolve({ prompt: "Write copy", metadata: { cdfQualityAttempt: 3 } });
    expect(out.ok && out.value.providerId).toBe("provider.openai");
  });
});
