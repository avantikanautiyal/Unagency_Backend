/**
 * Jobs claimed in one tick run concurrently — a fan-out of creatives must not
 * wait for each other, and a long job must not hold up the ones behind it.
 */

import {
  setupDistributedExecution,
  sampleEnqueue,
} from "../../../../src/platform/infrastructure/execution/testing";

describe("Distributed Execution — concurrent tick", () => {
  it("starts every claimed job before any of them finishes", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const executor = {
      async execute() {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return {
          ok: true as const,
          value: { durationMs: 1, stages: ["done"], summary: {} },
        };
      },
    };
    const { engine } = setupDistributedExecution({ executor: executor as never });
    engine.registerWorker("execution", 4);
    const ids = [];
    for (const name of ["a", "b", "c"]) {
      const enq = await engine.enqueue(sampleEnqueue(name));
      if (!enq.ok) throw new Error("enqueue failed");
      ids.push(enq.value.jobId);
    }

    const ticking = engine.tick(4);
    // Let the tick claim and start its slots.
    for (let i = 0; i < 20 && releases.length < 3; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(peak).toBe(3);
    releases.forEach((release) => release());

    const tick = await ticking;
    expect(tick.ok).toBe(true);
    for (const id of ids) {
      const job = engine.getJob(id);
      expect(job.ok && job.value.status).toBe("completed");
    }
  });
});
