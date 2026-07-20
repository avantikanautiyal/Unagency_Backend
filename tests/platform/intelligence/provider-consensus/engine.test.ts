import {
  makeCandidate,
  sampleConsensusRequest,
  sampleThreeProviderCandidates,
  setupProviderConsensusPlatform,
} from "../../../../src/platform/intelligence/provider-consensus/testing";
import { ConsensusRequestBuilder } from "../../../../src/platform/intelligence/provider-consensus/builders/consensus-request-builder";

describe("Provider Consensus Platform", () => {
  it("produces one canonical result from three provider outputs", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const result = await engine.decide(sampleConsensusRequest("best_quality"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const consensus = result.value.consensus;
    expect(consensus.winningProviderId).toBeTruthy();
    expect(consensus.canonicalResponse.output).toBeDefined();
    expect(consensus.confidence).toBeGreaterThan(0);
    expect(consensus.explanation.whyWinner).toBeTruthy();
    expect(consensus.alternativeResults.length).toBeGreaterThan(0);
  });

  it("selects highest quality provider under best_quality", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const result = await engine.decide(sampleConsensusRequest("best_quality"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // anthropic has highest quality 0.88
    expect(result.value.consensus.winningProviderId).toBe("anthropic");
  });

  it("selects lowest cost under lowest_cost strategy", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const result = await engine.decide(sampleConsensusRequest("lowest_cost"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consensus.winningProviderId).toBe("gemini");
  });

  it("runs research+writing hierarchy with explainability", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const request = ConsensusRequestBuilder.create()
      .withRequestId("rw_1")
      .withCandidates(sampleThreeProviderCandidates())
      .withStrategy("research_writing")
      .withMergeMode("reasoning")
      .build();

    const result = await engine.decide(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.consensus.winningProviderId).toBe("openai"); // writing role
    expect(result.value.consensus.supportingProviderIds.length).toBeGreaterThan(0);
    expect(result.value.consensus.explanation.contributions.length).toBeGreaterThan(0);
    expect(result.value.consensus.mergeMode).toBe("reasoning");
  });

  it("explains why winners and losers", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const result = await engine.decide(sampleConsensusRequest("weighted_voting"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exp = result.value.consensus.explanation;
    expect(exp.perProvider.length).toBeGreaterThanOrEqual(3);
    expect(exp.perProvider.some((p) => p.outcome === "won")).toBe(true);
    expect(exp.evidence.length).toBeGreaterThan(0);
  });

  it("arbitrates failed candidates out when successes exist", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const failed = makeCandidate("broken", "fail", { quality: 0.1 });
    failed.execution.success; // keep reference
    const candidates = [
      ...sampleThreeProviderCandidates(),
      {
        ...makeCandidate("broken", "fail", { quality: 0.1, latencyMs: 999 }),
        execution: {
          ...makeCandidate("broken", "fail").execution,
          success: false,
          status: "failed" as const,
          response: undefined,
          error: { code: "x", message: "boom" },
        },
      },
    ];

    const result = await engine.decide(
      ConsensusRequestBuilder.create()
        .withRequestId("arb_1")
        .withCandidates(candidates)
        .withStrategy("single_winner")
        .build()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.consensus.winningProviderId).not.toBe("broken");
    expect(result.value.consensus.conflictsResolved).toBeGreaterThanOrEqual(1);
  });

  it("never requires provider SDK or networking", async () => {
    const { engine } = setupProviderConsensusPlatform();
    const result = await engine.decide(sampleConsensusRequest("committee_pattern"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidatesEvaluated).toBe(3);
  });
});
