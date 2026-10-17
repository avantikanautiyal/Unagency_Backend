/**
 * Brand extraction is a pure function of the brief: each step used to re-run
 * it 2–3 times (~2–3 s each). Cached per org + brief; concurrent identical
 * calls share one provider request.
 */
import {
  extractBrandPreferencesWithLlm,
  resetBrandExtractCacheForTests,
} from "../../src/services/brand-brief-llm-extractor";

function fakeIntegration() {
  let calls = 0;
  const integration = {
    run: async () => {
      calls += 1;
      return {
        ok: true,
        value: {
          success: true,
          artifacts: {
            runtime: {
              response: {
                output: {
                  structured: { brandName: "Chikankari Hues", colors: ["green"] },
                },
              },
            },
          },
        },
      };
    },
  };
  return { integration: integration as never, calls: () => calls };
}

describe("brand extraction cache", () => {
  beforeEach(() => resetBrandExtractCacheForTests());

  it("runs once for repeated and concurrent identical briefs", async () => {
    const fake = fakeIntegration();
    const args = {
      integration: fake.integration,
      organizationId: "org_1",
      prompt: "Chikankari Hues — Lucknowi hand embroidery, green palette",
      rollout: "on" as const,
    };
    const [a, b] = await Promise.all([
      extractBrandPreferencesWithLlm(args),
      extractBrandPreferencesWithLlm(args),
    ]);
    const c = await extractBrandPreferencesWithLlm(args);
    expect(fake.calls()).toBe(1);
    expect(a.brandName).toBe("Chikankari Hues");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("a different brief or organization is extracted again", async () => {
    const fake = fakeIntegration();
    const base = { integration: fake.integration, rollout: "on" as const };
    await extractBrandPreferencesWithLlm({ ...base, organizationId: "org_1", prompt: "Brief one for brand A" });
    await extractBrandPreferencesWithLlm({ ...base, organizationId: "org_1", prompt: "Brief two for brand A" });
    await extractBrandPreferencesWithLlm({ ...base, organizationId: "org_2", prompt: "Brief one for brand A" });
    expect(fake.calls()).toBe(3);
  });
});
