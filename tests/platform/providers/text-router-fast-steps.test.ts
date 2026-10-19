/**
 * Short CDF text steps (routes / territories): Claude Haiku 4.5, then GPT-4o,
 * then Gemini Flash, with Claude Sonnet 4.5 as the last-resort failover.
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

const all = ["provider.openai", "provider.anthropic", "provider.gemini"];
const routesStep = {
  service: "social",
  subtype: "content-design",
  cdfAuthorityStructuredOutputName: "CdfSocialMediaRoutes",
};

describe("TextExecutionRouter — fast text steps", () => {
  it("routes a routes step Haiku → GPT-4o → Gemini Flash → Sonnet", () => {
    const out = router(all).resolve({ prompt: "Three routes", metadata: routesStep });
    if (!out.ok) throw new Error("no route");
    expect(`${out.value.providerId}/${out.value.modelId}`).toBe(
      "provider.anthropic/claude-haiku-4-5",
    );
    expect(out.value.failoverChain.map((s) => `${s.providerId}/${s.modelId}`)).toEqual([
      "provider.openai/gpt-4o",
      "provider.gemini/gemini-flash-latest",
      "provider.anthropic/claude-sonnet-4-5",
    ]);
  });

  it("uses GPT-4o when Anthropic is not configured", () => {
    const out = router(["provider.openai", "provider.gemini"]).resolve({
      prompt: "Territories",
      metadata: { ...routesStep, cdfAuthorityStructuredOutputName: "CdfCreativeDirections" },
    });
    expect(out.ok && out.value.providerId).toBe("provider.openai");
  });

  it("leaves other text steps on their use-case list", () => {
    const out = router(all).resolve({
      prompt: "Three routes",
      metadata: { service: "social", subtype: "content-design", outputKind: "text" },
    });
    expect(out.ok && out.value.providerId).toBe("provider.anthropic");
  });
});
