import { DefaultComplianceEngine } from "../../../../../src/platform/intelligence/providers/routing/compliance/default-compliance-engine";
import { DefaultFailoverEngine } from "../../../../../src/platform/intelligence/providers/routing/failover/default-failover-engine";
import { loadBalancerFor } from "../../../../../src/platform/intelligence/providers/routing/load-balancing/load-balancers";
import { DefaultRoutingDiagnostics } from "../../../../../src/platform/intelligence/providers/routing/diagnostics/default-diagnostics";
import {
  makeCandidate,
  makeRoutingRequest,
  makeTenCandidates,
} from "../../../../../src/platform/intelligence/providers/routing/testing";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Compliance engine", () => {
  it("filters by latency constraint", () => {
    const engine = new DefaultComplianceEngine();
    const candidates = [
      makeCandidate({
        providerId: asProviderId("slow"),
        vendor: "slow",
        estimatedLatencyMs: 5000,
      }),
      makeCandidate({
        providerId: asProviderId("fast"),
        vendor: "fast",
        estimatedLatencyMs: 50,
      }),
    ];
    const filtered = engine.filter(candidates, [
      { code: "latency", message: "max 1000", maxLatencyMs: 1000 },
    ]);
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.value).toHaveLength(1);
    expect(String(filtered.value[0].providerId)).toBe("fast");
  });
});

describe("Failover engine", () => {
  it("builds a failover chain from recommendations", () => {
    const engine = new DefaultFailoverEngine();
    const request = makeRoutingRequest(makeTenCandidates());
    const recs = makeTenCandidates().map((c, i) => ({
      providerId: c.providerId,
      modelId: c.modelId,
      score: { providerId: c.providerId, total: 1 - i * 0.1, dimensions: {} as never },
      reason: "test",
      selected: i === 0,
    }));
    const chain = engine.buildChain(recs, request);
    expect(chain.ok).toBe(true);
    if (chain.ok) expect(chain.value.length).toBeGreaterThan(1);
  });
});

describe("Load balancers", () => {
  it("selects via round robin and weighted", () => {
    const recs = makeTenCandidates().map((c) => ({
      providerId: c.providerId,
      score: { providerId: c.providerId, total: 1, dimensions: {} as never },
      reason: "t",
      selected: false,
    }));
    const rr = loadBalancerFor("round_robin").select(recs, makeRoutingRequest(makeTenCandidates()));
    const wt = loadBalancerFor("weighted").select(recs, makeRoutingRequest(makeTenCandidates()));
    expect(rr.ok && wt.ok).toBe(true);
  });
});

describe("Diagnostics", () => {
  it("reports unhealthy providers and topology", () => {
    const diagnostics = new DefaultRoutingDiagnostics();
    const request = makeRoutingRequest([
      makeCandidate({
        providerId: asProviderId("bad"),
        vendor: "bad",
        healthy: false,
      }),
    ]);
    const report = diagnostics.analyze(request);
    expect(report.unhealthyProviders).toContain("bad");
    expect(diagnostics.topology(request).nodes).toHaveLength(1);
  });
});
