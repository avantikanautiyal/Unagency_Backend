import { ResultAggregator } from "../../../../src/platform/intelligence/orchestrator/aggregation/result-aggregator";

describe("ResultAggregator", () => {
  const aggregator = new ResultAggregator();

  it("aggregates a single successful result", () => {
    const result = aggregator.aggregate({
      orchestrationId: "o1",
      planId: "p1",
      contributions: [
        {
          sessionId: "s1",
          state: "completed",
          success: true,
          completedAt: "2026-01-01T00:00:00.000Z",
          output: { ok: true },
        },
      ],
      completedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("completed");
      expect(result.value.aggregated?.success).toBe(true);
    }
  });

  it("marks partial when mixed results", () => {
    const result = aggregator.aggregate({
      orchestrationId: "o1",
      planId: "p1",
      contributions: [
        {
          sessionId: "s1",
          state: "completed",
          success: true,
          completedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          sessionId: "s2",
          state: "failed",
          success: false,
          completedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      completedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("partial");
      expect(result.value.contributions).toHaveLength(2);
    }
  });
});
