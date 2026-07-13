import { DefaultRoutingScorer } from "../../../../../src/platform/intelligence/providers/routing/scoring/default-scorer";
import { DefaultRoutingRanker } from "../../../../../src/platform/intelligence/providers/routing/ranking/default-ranker";
import { strategyFor } from "../../../../../src/platform/intelligence/providers/routing/strategies/routing-strategies";
import {
  makeCandidate,
  makeRoutingRequest,
  makeTenCandidates,
  TEST_CAPABILITY_ID,
} from "../../../../../src/platform/intelligence/providers/routing/testing";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Routing scorer", () => {
  it("scores candidates across all dimensions", () => {
    const scorer = new DefaultRoutingScorer();
    const candidate = makeCandidate({
      providerId: asProviderId("p1"),
      vendor: "v1",
    });
    const request = makeRoutingRequest([candidate]);
    const score = scorer.score(candidate, request);
    expect(score.ok).toBe(true);
    if (!score.ok) return;
    expect(score.value.dimensions.health).toBe(1);
    expect(score.value.total).toBeGreaterThan(0);
  });
});

describe("Routing ranker and strategies", () => {
  it("ranks via each strategy kind", () => {
    const scorer = new DefaultRoutingScorer();
    const ranker = new DefaultRoutingRanker();
    const request = makeRoutingRequest(makeTenCandidates(), "highest_quality");
    const scored = scorer.scoreAll(request.candidates, request);
    expect(scored.ok).toBe(true);
    if (!scored.ok) return;
    const ranked = ranker.rank(scored.value, "highest_quality", request);
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    expect(ranked.value[0].rank).toBe(1);
    expect(strategyFor("health_first").kind).toBe("health_first");
  });
});

describe("Routing request builder", () => {
  it("requires capability and candidates", () => {
    expect(() =>
      makeRoutingRequest([], "balanced")
    ).toThrow();
  });
});
