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
        { providerId: "provider.openai", modelId: "gpt-image-2.5-sunburst" },
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
    const openai = plan.targets.find((t) => t.providerId === "provider.openai")!;
    const google = plan.targets.find((t) => t.providerId === "provider.google")!;
    const openaiAlt = plan.targets.filter(
      (t) => t.providerId === "provider.openai",
    )[1]!;

    const metaA = buildGenerationFanoutLeafMetadata({
      plan,
      target: openai,
      matrixFailoverChain: [
        { providerId: google.providerId, modelId: google.modelId },
        { providerId: openaiAlt.providerId, modelId: openaiAlt.modelId },
      ],
    });
    const metaB = buildGenerationFanoutLeafMetadata({ plan, target: google });

    assert.equal(metaA.generationFanoutTargetId, openai.targetId);
    assert.equal(metaB.generationFanoutTargetId, google.targetId);
    assert.notEqual(
      metaA.generationFanoutTargetId,
      metaB.generationFanoutTargetId,
    );

    // Sibling Google stripped; same-provider OpenAI alt may remain.
    assert.equal(
      metaA.imageFailoverChain.some((s) => s.providerId === "provider.google"),
      false,
    );
    assert.ok(metaB.imageFailoverChain.length >= 1);
    for (const step of metaB.imageFailoverChain) {
      assert.equal(step.providerId, "provider.google");
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
