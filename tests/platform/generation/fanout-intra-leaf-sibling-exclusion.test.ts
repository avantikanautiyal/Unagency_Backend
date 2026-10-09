/**
 * Fanout = independent leaves; fallback = intra-leaf only.
 * A leaf's fallback chain must never contain a sibling target's exact
 * provider/model (that would collapse two declared leaves into one), and the
 * runtime re-resolution must keep that exclusion.
 */

import * as be from "../../../src/platform/generation/generation-fanout";
import * as fe from "../../../../Unagency-frontend/packages/api/src/domain/generation-fanout";

const EXECUTABLE = new Set(["provider.openai", "provider.google"]);

const impls = [
  {
    name: "backend",
    plan: () =>
      be.planImageGenerationFanout({
        useCase: "marketing_creative" as never,
        groupId: "fanout_test",
        executableProviderIds: EXECUTABLE,
      }),
    leaf: be.buildGenerationFanoutLeafMetadata as (i: never) => Record<string, unknown>,
    resolve: be.resolveIntraLeafFailoverChain,
  },
  {
    name: "frontend",
    plan: () =>
      fe.planImageGenerationFanout({
        useCase: "marketing_creative" as never,
        groupId: "fanout_test",
      }),
    leaf: fe.buildGenerationFanoutLeafMetadata as (i: never) => Record<string, unknown>,
    resolve: fe.resolveIntraLeafFailoverChain,
  },
];

describe.each(impls)("fanout leaf independence ($name)", ({ plan, leaf, resolve }) => {
  it("3 declared targets → 3 independent target identities", () => {
    const p = plan();
    const ids = p.targets.map((t) => t.targetId);
    expect(p.targets.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    expect(p.targets.map((t) => `${t.providerId}/${t.modelId}`)).toEqual([
      "provider.google/gemini-3.1-flash-image",
      "provider.google/gemini-3-pro-image",
      "provider.openai/gpt-image-1.5",
    ]);
  });

  it("each leaf chain is same-provider and never a sibling target", () => {
    const p = plan();
    const keys = p.targets.map((t) => `${t.providerId}::${t.modelId}`);
    for (const t of p.targets) {
      const meta = leaf({ plan: p, target: t } as never);
      expect(meta.generationFanoutTargetId).toBe(t.targetId);
      expect(meta.generationFanoutGroupId).toBe("fanout_test");
      expect(meta.disableCrossProviderFailover).toBe(true);
      const chain = meta.imageFailoverChain as { providerId: string; modelId: string }[];
      expect(chain.length).toBeGreaterThan(0);
      for (const step of chain) {
        expect(step.providerId).toBe(t.providerId);
        expect(keys).not.toContain(`${step.providerId}::${step.modelId}`);
      }
      expect(meta.generationFanoutSiblingModelKeys).toEqual(
        keys.filter((k) => k !== `${t.providerId}::${t.modelId}`),
      );
    }
  });

  it("gemini flash leaf never falls back to the gemini-3-pro leaf's model", () => {
    const p = plan();
    const flash = p.targets.find((t) => t.modelId === "gemini-3.1-flash-image")!;
    const chain = leaf({ plan: p, target: flash } as never).imageFailoverChain as {
      modelId: string;
    }[];
    expect(chain.map((c) => c.modelId)).not.toContain("gemini-3-pro-image");
  });

  it("runtime re-resolution honours sibling exclusion (matrix chain cannot widen it)", () => {
    const chain = resolve({
      primaryProviderId: "provider.google",
      primaryModelId: "gemini-3.1-flash-image",
      matrixChain: [
        { providerId: "provider.google", modelId: "gemini-3-pro-image" },
        { providerId: "provider.openai", modelId: "gpt-image-1.5" },
      ],
      excludeModelKeys: new Set([
        "provider.google::gemini-3-pro-image",
        "provider.openai::gpt-image-1.5",
      ]),
    });
    expect(chain.map((c) => `${c.providerId}::${c.modelId}`)).not.toContain(
      "provider.google::gemini-3-pro-image",
    );
    expect(chain.every((c) => c.providerId === "provider.google")).toBe(true);
  });
});
