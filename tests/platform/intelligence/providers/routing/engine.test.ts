import {
  asProviderId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import {
  makeCandidate,
  makeRoutingRequest,
  makeTenCandidates,
  setupRoutingPlatform,
} from "../../../../../src/platform/intelligence/providers/routing/testing";

describe("Routing engine", () => {
  it("deterministically routes ten capable providers (balanced)", async () => {
    const { engine } = setupRoutingPlatform();
    const candidates = makeTenCandidates();
    const decision = await engine.route(
      makeRoutingRequest(candidates, "balanced")
    );

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.plan.primary.providerId).toBeDefined();
    expect(decision.value.scores).toHaveLength(10);
    expect(decision.value.plan.fallbacks.length).toBe(9);
    expect(decision.value.plan.statistics.candidatesEvaluated).toBe(10);
  });

  it("selects lowest latency provider with lowest_latency strategy", async () => {
    const { engine } = setupRoutingPlatform();
    const candidates = makeTenCandidates();
    const decision = await engine.route(
      makeRoutingRequest(candidates, "lowest_latency")
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(String(decision.value.plan.primary.providerId)).toBe("provider-1");
  });

  it("selects lowest cost provider with lowest_cost strategy", async () => {
    const { engine } = setupRoutingPlatform();
    const candidates = makeTenCandidates();
    const decision = await engine.route(
      makeRoutingRequest(candidates, "lowest_cost")
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(String(decision.value.plan.primary.providerId)).toBe("provider-10");
  });

  it("respects provider preference strategy", async () => {
    const { engine } = setupRoutingPlatform();
    const preferred = asProviderId("provider-5");
    const candidates = makeTenCandidates();
    const request = {
      ...makeRoutingRequest(candidates, "provider_preference"),
      preferences: { preferredProviders: [preferred] },
    };
    const decision = await engine.route(request);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.plan.primary.providerId).toBe(preferred);
  });

  it("filters unhealthy providers via compliance constraints", async () => {
    const { engine } = setupRoutingPlatform();
    const candidates = [
      makeCandidate({
        providerId: asProviderId("bad"),
        vendor: "bad",
        healthy: false,
      }),
      ...makeTenCandidates(),
    ];
    const decision = await engine.route({
      ...makeRoutingRequest(candidates, "balanced"),
      constraints: [{ code: "health", message: "must be healthy", required: true }],
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(String(decision.value.plan.primary.providerId)).not.toBe("bad");
  });

  it("assigns canary experiment when strategy is canary", async () => {
    const { engine } = setupRoutingPlatform();
    const decision = await engine.route(
      makeRoutingRequest(makeTenCandidates(), "canary")
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.plan.experiments.some((e) => e.kind === "canary")).toBe(
      true
    );
  });

  it("assigns shadow experiment when strategy is shadow", async () => {
    const { engine } = setupRoutingPlatform();
    const decision = await engine.route(
      makeRoutingRequest(makeTenCandidates(), "shadow")
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.plan.experiments.some((e) => e.kind === "shadow")).toBe(
      true
    );
  });

  it("explain returns scores without producing a full plan selection path failure", async () => {
    const { engine } = setupRoutingPlatform();
    const explained = await engine.explain(makeRoutingRequest(makeTenCandidates()));
    expect(explained.ok).toBe(true);
    if (explained.ok) expect(explained.value).toHaveLength(10);
  });
});
