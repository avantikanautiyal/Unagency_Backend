/**
 * M9.3 — Simulated provider load baseline (no real provider calls).
 */

import { ControllableDispatcher } from "../../../src/platform/intelligence/providers/runtime/testing";
import { setupIntelligenceOsIntegration } from "../../../src/platform/intelligence/integration/testing";
import { asOrganizationId, asWorkspaceId } from "../../../src/platform/intelligence/shared/identifiers";

const CONCURRENCY_LEVELS = [1, 5, 10, 25, 50] as const;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx]!;
}

describe("M9.3 simulated load baseline", () => {
  for (const concurrency of CONCURRENCY_LEVELS) {
    it(`completes ${concurrency} concurrent simulated executions`, async () => {
      const dispatcher = new ControllableDispatcher();
      const integration = setupIntelligenceOsIntegration({
        runtimeDispatcher: dispatcher,
      }).engine;

      const started = Date.now();
      const latencies: number[] = [];

      const tasks = Array.from({ length: concurrency }, (_, i) => async () => {
        const t0 = Date.now();
        const result = await integration.run({
          requestId: `load_${concurrency}_${i}`,
          rawPrompt: `load test ${i}`,
          organizationId: asOrganizationId("org_1"),
          workspaceId: asWorkspaceId("ws_1"),
          mode: "planning_through_routing",
          metadata: { userId: "ios_test_user", brandId: "brand_org_1" },
        });
        latencies.push(Date.now() - t0);
        return result;
      });

      const results = await Promise.all(tasks.map((t) => t()));
      latencies.sort((a, b) => a - b);

      const successes = results.filter((r) => r.ok).length;
      expect(successes).toBe(concurrency);
      expect(dispatcher.attempts).toBe(0);

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          concurrency,
          successes,
          failures: concurrency - successes,
          wallMs: Date.now() - started,
          p50Ms: percentile(latencies, 50),
          p95Ms: percentile(latencies, 95),
          p99Ms: percentile(latencies, 99),
        })
      );
    }, 180_000);
  }
});
