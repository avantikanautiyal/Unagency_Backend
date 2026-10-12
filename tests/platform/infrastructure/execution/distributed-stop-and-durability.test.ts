/**
 * Stop must reach a running job, and a finished job's result must survive a
 * temporary database outage.
 */

import {
  setupDistributedExecution,
  sampleEnqueue,
} from "../../../../src/platform/infrastructure/execution/testing";
import { InMemoryJobStore } from "../../../../src/platform/infrastructure/execution/persistence/in-memory-job-store";
import type { ExecutionJob } from "../../../../src/platform/infrastructure/execution/contracts/job";

const flush = async (until: () => boolean) => {
  for (let i = 0; i < 50 && !until(); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

describe("Distributed Execution — stop and durability", () => {
  it("cancel flips the running job's signal and the job ends cancelled, not completed", async () => {
    let seen: { cancelled: boolean } | undefined;
    let release!: () => void;
    const executor = {
      async execute(_job: ExecutionJob, signal: { cancelled: boolean }) {
        seen = signal;
        await new Promise<void>((resolve) => (release = resolve));
        // A real executor checks the flag before any further provider work.
        if (signal.cancelled) {
          return { ok: false as const, error: new Error("job cancelled during execution") };
        }
        return { ok: true as const, value: { durationMs: 1, stages: ["s"], summary: {} } };
      },
    };
    const cancelWrites: string[] = [];
    const store = new InMemoryJobStore() as InMemoryJobStore & {
      persistCancelRequest?: (jobId: unknown, status: string) => Promise<void>;
    };
    store.persistCancelRequest = async (jobId, status) => {
      cancelWrites.push(`${String(jobId)}:${status}`);
    };
    const { engine } = setupDistributedExecution({ executor: executor as never, store });
    engine.registerWorker("execution", 2);
    const enq = await engine.enqueue(sampleEnqueue());
    if (!enq.ok) throw new Error("enqueue failed");

    const ticking = engine.tick(1);
    await flush(() => Boolean(seen));
    expect(seen?.cancelled).toBe(false);

    const cancelled = await engine.cancel(enq.value.jobId, "user_stop");
    expect(cancelled.ok).toBe(true);
    expect(seen?.cancelled).toBe(true);
    expect(cancelWrites).toHaveLength(1);

    release();
    await ticking;
    const job = engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("cancelled");
  });

  it("retries the durable write of a finished job and re-flushes it on a later tick", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    try {
      let failing = true;
      const durable: string[] = [];
      const store = new InMemoryJobStore() as InMemoryJobStore & {
        persist?: (job: ExecutionJob) => Promise<void>;
      };
      store.persist = async (job) => {
        if (failing && job.status === "completed") throw new Error("connection timed out");
        durable.push(`${String(job.jobId)}:${job.status}`);
      };
      const { engine } = setupDistributedExecution({ store });
      engine.registerWorker("execution", 2);
      const enq = await engine.enqueue(sampleEnqueue());
      if (!enq.ok) throw new Error("enqueue failed");

      const ticking = engine.tick(1);
      // Let the bounded backoff (4 attempts) run out while the database is down.
      for (let i = 0; i < 12; i += 1) {
        await jest.advanceTimersByTimeAsync(5_000);
      }
      await ticking;
      // The result is still held by the engine …
      const job = engine.getJob(enq.value.jobId);
      expect(job.ok && job.value.status).toBe("completed");
      expect(durable.some((d) => d.endsWith(":completed"))).toBe(false);

      // … and is written as soon as the database is back.
      failing = false;
      await engine.tick(1);
      expect(durable.filter((d) => d.endsWith(":completed"))).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
