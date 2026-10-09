/**
 * Intra-leaf failover — primary failure stays inside the same fanout leaf.
 * Never consumes sibling providers / ArtifactVersions.
 */

import assert from "node:assert/strict";
import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
  resolveIntraLeafFailoverChain,
} from "../../../src/platform/generation/generation-fanout";

describe("intra-leaf failover (provider/model)", () => {
  it("same-provider model fallback for Google leaf", () => {
    const chain = resolveIntraLeafFailoverChain({
      primaryProviderId: "provider.google",
      primaryModelId: "gemini-3-pro-image",
      matrixChain: [
        { providerId: "provider.openai", modelId: "gpt-image-1" },
        { providerId: "provider.google", modelId: "gemini-3.1-flash-image" },
        { providerId: "provider.openai", modelId: "gpt-image-1.5" },
      ],
    });
    assert.ok(chain.length >= 1);
    for (const step of chain) {
      assert.equal(step.providerId, "provider.google");
      assert.notEqual(step.modelId, "gemini-3-pro-image");
    }
    assert.equal(
      chain.some((s) => s.providerId === "provider.openai"),
      false,
    );
  });

  it("primary model failure → fallback stays within same leaf metadata", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "intra_leaf_group",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    const [google, googleAlt] = plan.targets.filter(
      (t) => t.providerId === "provider.google",
    );
    const openai = plan.targets.find((t) => t.providerId === "provider.openai")!;

    const metaA = buildGenerationFanoutLeafMetadata({
      plan,
      target: google!,
      matrixFailoverChain: [
        { providerId: googleAlt!.providerId, modelId: googleAlt!.modelId },
        { providerId: openai.providerId, modelId: openai.modelId },
      ],
    });
    const metaB = buildGenerationFanoutLeafMetadata({ plan, target: openai });

    assert.equal(metaA.generationFanoutTargetId, google!.targetId);
    assert.equal(metaB.generationFanoutTargetId, openai.targetId);
    assert.notEqual(
      metaA.generationFanoutTargetId,
      metaB.generationFanoutTargetId,
    );

    // Sibling Gemini model + OpenAI stripped; only same-provider recovery remains.
    for (const step of metaA.imageFailoverChain) {
      assert.equal(step.providerId, "provider.google");
      assert.notEqual(step.modelId, googleAlt!.modelId);
    }
    assert.ok(metaB.imageFailoverChain.length >= 1);
    for (const step of metaB.imageFailoverChain) {
      assert.equal(step.providerId, "provider.openai");
    }
  });

  it("one failed leaf chain does not alter sibling leaf identity", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "sibling_isolation",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    const metas = plan.targets.map((t) =>
      buildGenerationFanoutLeafMetadata({ plan, target: t }),
    );
    const ids = metas.map((m) => m.generationFanoutTargetId);
    assert.equal(new Set(ids).size, 3);
    assert.equal(new Set(metas.map((m) => m.preferredModelId)).size, 3);
    assert.equal(
      metas.every((m) => m.generationFanoutGroupId === "sibling_isolation"),
      true,
    );
  });

  it("provider unavailable does not collapse declared cardinality", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "avail",
      executableProviderIds: new Set(["provider.openai"]),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
  });
});
