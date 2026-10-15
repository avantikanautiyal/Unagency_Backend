import { tryDeterministicCompositionCanonicalBridge } from "../../../src/platform/cdf/deterministic-composition/canonical-composition-bridge";

describe("deterministic composition bridge — text-free plate gate", () => {
  it("does not stamp text over a provider plate that was not generated text-free", async () => {
    const result = await tryDeterministicCompositionCanonicalBridge({
      metadata: {
        cdfDeliverableKind: "social_creative",
        generationFanoutLeaf: true,
        cdfSelectedPrimaryMessage: "Timeless elegance, crafted to perfection",
      },
      mediaArtifactId: "art_plate_with_text",
      executionId: "exec_text_free_gate",
      organizationId: "org_text_free_gate",
      asyncMedia: {} as never,
    });
    expect(result).toEqual({ applied: false, reason: "not_required" });
  });
});
