/**
 * P4.9.6 — Distributed worker recovery loop integrity (zero paid API calls).
 */

import { createDistributedExecutionPlatform } from "../../../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";
import { InMemoryClaimableJobStore } from "../../../../src/platform/infrastructure/durability/repositories/in-memory-claimable-job-store";
import { StubJobExecutor } from "../../../../src/platform/infrastructure/execution/workers/job-executors";
import { asJobId } from "../../../../src/platform/infrastructure/execution/contracts/job";
import type { ExecutionJob } from "../../../../src/platform/infrastructure/execution/contracts/job";
import { DEFAULT_RETRY_POLICY } from "../../../../src/platform/infrastructure/execution/constants";

function sampleJob(id: string, prompt: string): ExecutionJob {
  return {
    jobId: asJobId(id),
    queueKind: "immediate",
    status: "queued",
    priority: "normal",
    payload: { rawPrompt: prompt, organizationId: "org_recovery496" },
    attempt: 0,
    maxAttempts: DEFAULT_RETRY_POLICY.maxAttempts,
    retryPolicy: DEFAULT_RETRY_POLICY,
    progressPercent: 0,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
    cancelRequested: false,
  };
}

function createRecoveryPlatform(store: InMemoryClaimableJobStore) {
  let executeCount = 0;
  const executor = {
    execute: async () => {
      executeCount += 1;
      return {
        ok: true as const,
        value: { summary: { success: true }, durationMs: 1 },
      };
    },
  };
  const platform = createDistributedExecutionPlatform({
    executor,
    jobStore: store,
    createId: (() => {
      let n = 0;
      return (p: string) => `${p}_${++n}`;
    })(),
  });
  platform.engine.registerWorker("execution", 4);
  return { platform, getExecuteCount: () => executeCount };
}

describe("P4.9.6 — distributed worker recovery loop", () => {
  it("recovered queued job is claimed once and executed", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_once496", "recover once"));
    const { platform, getExecuteCount } = createRecoveryPlatform(store);

    const tick = await platform.engine.tick(1);
    expect(tick.ok).toBe(true);
    expect(getExecuteCount()).toBe(1);
    const job = store.get(asJobId("job_once496"));
    expect(job?.status).toBe("completed");
  });

  it("second recovery scan does not re-enqueue the same active job", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_twice496", "no duplicate recovery"));
    const { platform, getExecuteCount } = createRecoveryPlatform(store);

    await platform.engine.tick(1);
    await platform.engine.tick(1);
    expect(getExecuteCount()).toBe(1);
    const job = store.get(asJobId("job_twice496"));
    expect(job?.status).toBe("completed");
  });

  it("successful job is no longer returned by listRunnableFromDatabase", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_done496", "terminal success"));
    const { platform } = createRecoveryPlatform(store);
    await platform.engine.tick(1);

    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.some((j) => String(j.jobId) === "job_done496")).toBe(false);
  });

  it("failed terminal job is no longer recoverable", async () => {
    const store = new InMemoryClaimableJobStore();
    const platform = createDistributedExecutionPlatform({
      executor: new StubJobExecutor("fail"),
      jobStore: store,
    });
    platform.engine.registerWorker("execution", 4);
    const enq = await platform.engine.enqueue({
      payload: { rawPrompt: "fail terminal", organizationId: "org_recovery496" },
      retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    await platform.engine.tick(1);
    const job = store.get(enq.value.jobId);
    expect(job?.status).toBe("dead_letter");

    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.some((j) => j.jobId === enq.value.jobId)).toBe(false);
    await platform.engine.tick(2);
    expect(store.get(enq.value.jobId)?.status).toBe("dead_letter");
  });

  it("genuinely stale leased job can be reclaimed and completed", async () => {
    const store = new InMemoryClaimableJobStore();
    const stale = {
      ...sampleJob("job_stale496", "stale lease"),
      status: "running" as const,
      reservedBy: "worker_dead" as never,
      leaseExpiresAt: "2020-01-01T00:00:00.000Z",
      attempt: 1,
    };
    store.save(stale);
    const { platform, getExecuteCount } = createRecoveryPlatform(store);

    await platform.engine.tick(1);
    expect(getExecuteCount()).toBe(1);
    expect(store.get(asJobId("job_stale496"))?.status).toBe("completed");
  });

  it("multiple queued jobs are consumed across ticks without duplicate execution", async () => {
    const store = new InMemoryClaimableJobStore();
    for (let i = 0; i < 4; i += 1) {
      store.save(sampleJob(`job_multi496_${i}`, `prompt ${i}`));
    }
    const { platform, getExecuteCount } = createRecoveryPlatform(store);

    await platform.engine.tick(2);
    await platform.engine.tick(2);
    expect(getExecuteCount()).toBe(4);
    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.length).toBe(0);
  });

  it("recovery after simulated process restart still completes durable queued jobs", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_restart496", "restart durable"));
    const first = createRecoveryPlatform(store);
    await first.platform.engine.tick(1);
    expect(store.get(asJobId("job_restart496"))?.status).toBe("completed");

    store.save({
      ...sampleJob("job_restart496_b", "second wave"),
    });
    const second = createRecoveryPlatform(store);
    await second.platform.engine.tick(1);
    expect(store.get(asJobId("job_restart496_b"))?.status).toBe("completed");
  });

  it("concurrent tryClaim allows only one worker to claim the same job", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_race496", "claim race"));
    const w1 = "worker_a" as never;
    const w2 = "worker_b" as never;
    const [c1, c2] = await Promise.all([
      store.tryClaim!(asJobId("job_race496"), w1, 30_000, new Date().toISOString()),
      store.tryClaim!(asJobId("job_race496"), w2, 30_000, new Date().toISOString()),
    ]);
    expect(Boolean(c1)).toBe(true);
    expect(Boolean(c2)).toBe(false);
  });

  it("renewLease extends an active claim", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_renew496", "renew"));
    const claimed = await store.tryClaim!(
      asJobId("job_renew496"),
      "worker_a" as never,
      1_000,
      new Date().toISOString(),
    );
    expect(claimed).toBeTruthy();
    const ok = await store.renewLease!(
      asJobId("job_renew496"),
      60_000,
      new Date().toISOString(),
      "worker_a" as never,
    );
    expect(ok).toBe(true);
    const job = store.get(asJobId("job_renew496"));
    expect(Date.parse(job?.leaseExpiresAt ?? "")).toBeGreaterThan(Date.now() + 40_000);
  });

  it("ghost queue entries for terminal jobs are dropped without re-execution", async () => {
    const store = new InMemoryClaimableJobStore();
    const job = sampleJob("job_ghost496", "ghost queue entry");
    store.save(job);
    const { platform, getExecuteCount } = createRecoveryPlatform(store);
    await platform.engine.tick(1);
    expect(store.get(asJobId("job_ghost496"))?.status).toBe("completed");

    // Simulate stale in-memory queue id while durable store is terminal.
    platform.rawEngine["queues"].get("immediate").enqueue(asJobId("job_ghost496"));
    await platform.engine.tick(1);
    expect(getExecuteCount()).toBe(1);
  });

  it("worker tick executes jobs instead of only scanning recovery", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleJob("job_progress496", "must execute"));
    let started = false;
    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      executor: {
        execute: async () => {
          started = true;
          return {
            ok: true as const,
            value: { summary: { provider: "stub" }, durationMs: 2 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 4);
    await platform.engine.tick(1);
    expect(started).toBe(true);
    expect(store.get(asJobId("job_progress496"))?.status).toBe("completed");
  });
});
