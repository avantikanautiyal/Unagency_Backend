/**
 * Durable job ownership / lease invariant — zero paid API calls.
 *
 * Invariant: while executor.execute(job) is active, the job cannot become
 * durably runnable and another worker cannot claim it.
 */

import { createDistributedExecutionPlatform } from "../../../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";
import { InMemoryClaimableJobStore } from "../../../../src/platform/infrastructure/durability/repositories/in-memory-claimable-job-store";
import { asJobId, asWorkerId } from "../../../../src/platform/infrastructure/execution/contracts/job";
import type { ExecutionJob } from "../../../../src/platform/infrastructure/execution/contracts/job";
import { DEFAULT_RETRY_POLICY } from "../../../../src/platform/infrastructure/execution/constants";

const LEASE_TTL_MS = 200;

function sampleQueued(id: string): ExecutionJob {
  return {
    jobId: asJobId(id),
    queueKind: "immediate",
    status: "queued",
    priority: "normal",
    payload: { rawPrompt: `prompt ${id}`, organizationId: "org_lease_own" },
    attempt: 0,
    maxAttempts: DEFAULT_RETRY_POLICY.maxAttempts,
    retryPolicy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 1, strategy: "none" },
    progressPercent: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    cancelRequested: false,
  };
}

describe("distributed job durable ownership / lease", () => {
  it("A — long execution exceeds original lease: renew keeps job non-runnable; single execute", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_long_lease_a"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T00:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: LEASE_TTL_MS * 5 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);

    const tickPromise = platform.engine.tick(1);

    // Wait until claimed/running
    for (let i = 0; i < 40; i += 1) {
      const j = store.get(asJobId("job_long_lease_a"));
      if (j?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(store.get(asJobId("job_long_lease_a"))?.status).toBe("running");

    // Advance past original lease several times while execute is active.
    // Heartbeat renews on engine clock via nowIso — advance in small steps
    // and allow heartbeat timers to fire on wall clock.
    for (let step = 0; step < 8; step += 1) {
      now += Math.floor(LEASE_TTL_MS / 2);
      await new Promise((r) => setTimeout(r, Math.floor(LEASE_TTL_MS / 3)));
      const recovered = await store.reclaimExpired!(
        new Date(now).toISOString(),
        now,
      );
      expect(recovered.some((j) => String(j.jobId) === "job_long_lease_a")).toBe(
        false,
      );
      const job = store.get(asJobId("job_long_lease_a"));
      expect(job?.status).toBe("running");
      expect(job?.reservedBy).toBeTruthy();
      const runnable = await store.listRunnableFromDatabase();
      expect(runnable.some((j) => String(j.jobId) === "job_long_lease_a")).toBe(
        false,
      );
    }

    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_long_lease_a"))?.status).toBe("completed");
  });

  it("B — recovery during active execution cannot second-claim or second-execute", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_recovery_b"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T01:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 10 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);

    const tickPromise = platform.engine.tick(1);
    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_recovery_b"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }

    for (let i = 0; i < 8; i += 1) {
      now += Math.floor(LEASE_TTL_MS / 2);
      await platform.engine.tick(2);
      await new Promise((r) => setTimeout(r, Math.floor(LEASE_TTL_MS / 4)));
    }

    expect(executeCount).toBe(1);
    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_recovery_b"))?.status).toBe("completed");
  });

  it("C — cross-worker: B cannot reclaim A's active lease; can reclaim after genuine expiry", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_cross_c"));

    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    let executeA = 0;
    let executeB = 0;
    let now = Date.parse("2026-09-15T02:00:00.000Z");

    const engineA = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (p) => `${p}_a_${now}`,
      executor: {
        execute: async () => {
          executeA += 1;
          await gateA;
          return {
            ok: true as const,
            value: { summary: { owner: "A" }, durationMs: 10 },
          };
        },
      },
    });
    engineA.engine.registerWorker("execution", 2);

    const engineB = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (p) => `${p}_b_${now}`,
      executor: {
        execute: async () => {
          executeB += 1;
          return {
            ok: true as const,
            value: { summary: { owner: "B" }, durationMs: 1 },
          };
        },
      },
    });
    engineB.engine.registerWorker("execution", 2);

    const tickA = engineA.engine.tick(1);
    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_cross_c"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const ownerA = store.get(asJobId("job_cross_c"))?.reservedBy;
    expect(ownerA).toBeTruthy();

    // While A is active and renewing, B must not reclaim.
    for (let i = 0; i < 4; i += 1) {
      now += Math.floor(LEASE_TTL_MS / 2);
      await new Promise((r) => setTimeout(r, Math.floor(LEASE_TTL_MS / 3)));
      await engineB.engine.tick(1);
      expect(store.get(asJobId("job_cross_c"))?.reservedBy).toBe(ownerA);
      expect(executeB).toBe(0);
    }

    // Simulate A death: expire durable lease via renewLease (ownership API),
    // then block further renews so heartbeat cannot resurrect the lease.
    const forced = store.get(asJobId("job_cross_c"))!;
    const expired = await store.renewLease!(
      forced.jobId,
      0,
      new Date(now - 1).toISOString(),
      forced.reservedBy,
    );
    expect(expired).toBe(true);
    store.renewLease = async () => false;
    // reclaim while A still blocked — ownership lost for A.
    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(recovered.some((j) => String(j.jobId) === "job_cross_c")).toBe(true);
    expect(store.get(asJobId("job_cross_c"))?.status).toBe("queued");

    await engineB.engine.tick(1);
    expect(executeB).toBe(1);
    expect(store.get(asJobId("job_cross_c"))?.status).toBe("completed");

    releaseA();
    await tickA;
    // A must not have finalized a second completion overwrite as owner.
    expect(executeA).toBe(1);
    expect(executeB).toBe(1);
  });

  it("D — ownership loss: worker does not silently finalize as owner", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_loss_d"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let now = Date.parse("2026-09-15T03:00:00.000Z");
    let executeCount = 0;
    let observedOwnershipLost = false;
    let observedCancelled = false;
    let attemptAtExecute = -1;

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async (job, signal) => {
          executeCount += 1;
          attemptAtExecute = job.attempt;
          await executeGate;
          // Cooperative checkpoint: wait for engine heartbeat to stamp
          // ownershipLost/cancelled onto the live signal object.
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            if (signal.ownershipLost === true || signal.cancelled === true) {
              observedOwnershipLost = signal.ownershipLost === true;
              observedCancelled = signal.cancelled === true;
              break;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);

    const tickPromise = platform.engine.tick(1);
    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_loss_d"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }

    const running = store.get(asJobId("job_loss_d"))!;
    expect(running.status).toBe("running");
    expect(running.reservedBy).toBeTruthy();
    const ownerAttempt = running.attempt;

    const expired = await store.renewLease!(
      running.jobId,
      0,
      new Date(now - 10).toISOString(),
      running.reservedBy,
    );
    expect(expired).toBe(true);
    store.renewLease = async () => false;
    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(recovered.length).toBeGreaterThan(0);
    expect(recovered.some((j) => String(j.jobId) === "job_loss_d")).toBe(true);
    const afterReclaim = store.get(asJobId("job_loss_d"))!;
    expect(afterReclaim.status).toBe("queued");
    expect(afterReclaim.reservedBy).toBeUndefined();
    expect(afterReclaim.leaseExpiresAt).toBeUndefined();
    // Reclaim requeues; it must not invent a retry/failover from the
    // original execution path (attempt stays until a new claim).
    expect(afterReclaim.attempt).toBe(ownerAttempt);

    releaseExecute();
    await tickPromise;

    expect(executeCount).toBe(1);
    expect(attemptAtExecute).toBe(ownerAttempt);
    // Actual ownership-loss signal must have been observed by the executor.
    expect(observedOwnershipLost || observedCancelled).toBe(true);
    expect(observedOwnershipLost).toBe(true);
    // Original owner must not finalize terminal completion after loss.
    expect(store.get(asJobId("job_loss_d"))?.status).toBe("queued");
    expect(store.get(asJobId("job_loss_d"))?.attempt).toBe(ownerAttempt);
  });

  it("E — concurrent tick: no duplicate claim/execution", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_concurrent_e"));
    let executeCount = 0;
    let now = Date.parse("2026-09-15T04:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await new Promise((r) => setTimeout(r, 40));
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 40 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 4);

    await Promise.all([
      platform.engine.tick(1),
      platform.engine.tick(1),
      platform.engine.tick(1),
      platform.engine.tick(1),
    ]);

    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_concurrent_e"))?.status).toBe("completed");
  });

  it("F — repeated hydrate-style ticks while executing do not create extra executions", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_poll_f"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T05:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 10 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);

    const tickPromise = platform.engine.tick(1);
    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_poll_f"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }

    // Simulate frontend poll → hydrate → tick coupling.
    for (let i = 0; i < 12; i += 1) {
      now += Math.floor(LEASE_TTL_MS / 3);
      await platform.engine.tick(1);
      await new Promise((r) => setTimeout(r, Math.floor(LEASE_TTL_MS / 5)));
    }

    expect(executeCount).toBe(1);
    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.some((j) => String(j.jobId) === "job_poll_f")).toBe(false);

    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_poll_f"))?.status).toBe("completed");
  });

  it("G — after restart, ownership is durable (in-memory Set irrelevant)", async () => {
    const store = new InMemoryClaimableJobStore();
    const owned: ExecutionJob = {
      ...sampleQueued("job_restart_g"),
      status: "running",
      reservedBy: asWorkerId("worker_dead_process"),
      attempt: 1,
      leaseExpiresAt: new Date(Date.parse("2026-09-15T06:00:00.000Z") + LEASE_TTL_MS).toISOString(),
      startedAt: "2026-09-15T06:00:00.000Z",
    };
    store.save(owned);

    let now = Date.parse("2026-09-15T06:00:00.000Z");
    let executeCount = 0;

    // New engine process — empty inFlightJobIds.
    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async () => {
          executeCount += 1;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);

    // Lease still valid — must NOT reclaim/execute.
    await platform.engine.tick(1);
    expect(executeCount).toBe(0);
    expect(store.get(asJobId("job_restart_g"))?.status).toBe("running");
    expect(store.get(asJobId("job_restart_g"))?.reservedBy).toBe(
      asWorkerId("worker_dead_process"),
    );

    // Genuine expiry after restart — reclaimable.
    now += LEASE_TTL_MS + 1;
    await platform.engine.tick(1);
    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_restart_g"))?.status).toBe("completed");
  });

  it("H — shutdown during active execution does not queue or allow duplicate claim", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_shutdown_h"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T08:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);
    const tickPromise = platform.engine.tick(1);

    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_shutdown_h"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const mid = store.get(asJobId("job_shutdown_h"));
    expect(mid?.status).toBe("running");
    expect(mid?.reservedBy).toBeTruthy();
    const ownerId = String(mid?.reservedBy);
    const leaseAtShutdown = mid?.leaseExpiresAt;

    await platform.engine.shutdown();

    // Active execution must remain owned — not durably runnable.
    const afterShutdown = store.get(asJobId("job_shutdown_h"));
    expect(afterShutdown?.status).toBe("running");
    expect(String(afterShutdown?.reservedBy)).toBe(ownerId);
    expect(afterShutdown?.leaseExpiresAt).toBe(leaseAtShutdown);
    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.some((j) => String(j.jobId) === "job_shutdown_h")).toBe(
      false,
    );

    // Another worker must not claim while execute is still active.
    let otherExecute = 0;
    const other = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 100;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          otherExecute += 1;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    other.engine.registerWorker("execution", 2);
    await other.engine.tick(1);
    expect(otherExecute).toBe(0);
    expect(await store.tryClaim(
      asJobId("job_shutdown_h"),
      asWorkerId("intruder_h"),
      LEASE_TTL_MS,
      new Date(now).toISOString(),
    )).toBeUndefined();

    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(otherExecute).toBe(0);
    expect(store.get(asJobId("job_shutdown_h"))?.status).toBe("completed");
  });

  it("I — failWorker during active execution does not queue or allow duplicate claim", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_fail_worker_i"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T09:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);
    const tickPromise = platform.engine.tick(1);

    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_fail_worker_i"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const mid = store.get(asJobId("job_fail_worker_i"));
    expect(mid?.status).toBe("running");
    const ownerId = String(mid?.reservedBy ?? "");
    expect(ownerId.length).toBeGreaterThan(0);

    platform.rawEngine.failWorker(ownerId);

    const afterFail = store.get(asJobId("job_fail_worker_i"));
    expect(afterFail?.status).toBe("running");
    expect(String(afterFail?.reservedBy)).toBe(ownerId);
    const runnable = await store.listRunnableFromDatabase();
    expect(runnable.some((j) => String(j.jobId) === "job_fail_worker_i")).toBe(
      false,
    );

    let otherExecute = 0;
    const other = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 200;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          otherExecute += 1;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    other.engine.registerWorker("execution", 2);
    await other.engine.tick(1);
    expect(otherExecute).toBe(0);

    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(otherExecute).toBe(0);
    expect(store.get(asJobId("job_fail_worker_i"))?.status).toBe("completed");
  });

  it("J — expired lease is not owned even if reclaim has not run", async () => {
    const store = new InMemoryClaimableJobStore();
    let now = Date.parse("2026-09-15T10:00:00.000Z");
    const workerId = asWorkerId("worker_lease_j");
    const job: ExecutionJob = {
      ...sampleQueued("job_lease_expired_j"),
      status: "running",
      reservedBy: workerId,
      attempt: 1,
      // Lease already in the past; reclaim has not run yet.
      leaseExpiresAt: new Date(now - 1).toISOString(),
      startedAt: new Date(now - LEASE_TTL_MS).toISOString(),
    };
    store.save(job);

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      executor: {
        execute: async () => ({
          ok: true as const,
          value: { summary: { success: true }, durationMs: 1 },
        }),
      },
    });

    const engine = platform.rawEngine as unknown as {
      verifyDurableOwnership(
        running: ExecutionJob,
        workerId: ReturnType<typeof asWorkerId>,
      ): Promise<boolean>;
    };

    // Status/reservedBy/attempt still match — but lease is expired.
    expect(store.get(asJobId("job_lease_expired_j"))?.status).toBe("running");
    expect(String(store.get(asJobId("job_lease_expired_j"))?.reservedBy)).toBe(
      String(workerId),
    );
    const ownsExpired = await engine.verifyDurableOwnership(job, workerId);
    expect(ownsExpired).toBe(false);

    // Same predicate accepts a still-valid lease (renewLease is the ownership API).
    const renewed = await store.renewLease!(
      job.jobId,
      LEASE_TTL_MS,
      new Date(now).toISOString(),
      workerId,
    );
    expect(renewed).toBe(true);
    const valid = store.get(asJobId("job_lease_expired_j"))!;
    const ownsValid = await engine.verifyDurableOwnership(valid, workerId);
    expect(ownsValid).toBe(true);
  });

  it("J2 — job_47 regression: stale running persist must not rewind renewed lease", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_47_stale_persist"));
    let now = Date.parse("2026-09-15T11:00:00.000Z");
    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);
    const tickPromise = platform.engine.tick(1);

    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_47_stale_persist"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const running = store.get(asJobId("job_47_stale_persist"));
    expect(running?.status).toBe("running");
    const renewedAt = running!.leaseExpiresAt!;

    // Simulate the live race: status persist with a *stale* older leaseExpiresAt
    // after renewLease advanced the durable lease (Mongo $set full document).
    // save() must ignore ownership fields for claimed jobs.
    const staleLease = new Date(now - LEASE_TTL_MS).toISOString();
    store.save({
      ...running!,
      leaseExpiresAt: staleLease,
      progressPercent: 10,
      updatedAt: new Date(now).toISOString(),
    });
    const afterStaleSave = store.get(asJobId("job_47_stale_persist"));
    expect(afterStaleSave!.leaseExpiresAt).toBe(renewedAt);
    expect(Date.parse(afterStaleSave!.leaseExpiresAt!)).toBeGreaterThan(
      Date.parse(staleLease),
    );

    // Advance past original claim TTL — renewed/preserved lease must block reclaim.
    now += LEASE_TTL_MS + 1;
    await new Promise((r) => setTimeout(r, Math.floor(LEASE_TTL_MS / 3)));
    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(
      recovered.some((j) => String(j.jobId) === "job_47_stale_persist"),
    ).toBe(false);

    // Second worker must not start attempt 2 while attempt 1 is active.
    let otherExecute = 0;
    const other = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 300;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          otherExecute += 1;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    other.engine.registerWorker("execution", 2);
    await other.engine.tick(1);
    expect(otherExecute).toBe(0);
    expect(executeCount).toBe(1);
    expect(store.get(asJobId("job_47_stale_persist"))?.attempt).toBe(1);

    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(otherExecute).toBe(0);
    expect(store.get(asJobId("job_47_stale_persist"))?.status).toBe("completed");
  });

  it("K — renew/reclaim race: successful renew wins; reclaim is no-op; finalize succeeds", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_renew_race_k"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T10:00:00.000Z");

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          executeCount += 1;
          await executeGate;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: LEASE_TTL_MS * 3 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);
    const tickPromise = platform.engine.tick(1);

    // T0/T1 — claim + execution started
    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_renew_race_k"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const running = store.get(asJobId("job_renew_race_k"));
    expect(running?.status).toBe("running");
    expect(running?.reservedBy).toBeTruthy();
    const owner = running!.reservedBy!;
    const leaseBeforeRenew = Date.parse(running!.leaseExpiresAt!);
    expect(Number.isFinite(leaseBeforeRenew)).toBe(true);

    // Advance engine clock slightly, then renew — proves durable leaseExpiresAt
    // actually advances under successful ownership renewal.
    now += Math.floor(LEASE_TTL_MS / 4);
    const renewOk = await store.renewLease!(
      running!.jobId,
      LEASE_TTL_MS,
      new Date(now).toISOString(),
      owner,
    );
    expect(renewOk).toBe(true);
    const afterRenew = store.get(asJobId("job_renew_race_k"))!;
    expect(String(afterRenew.reservedBy)).toBe(String(owner));
    expect(afterRenew.status).toBe("running");
    const renewedExpires = Date.parse(afterRenew.leaseExpiresAt!);
    expect(renewedExpires).toBeGreaterThan(now);
    expect(renewedExpires).toBeGreaterThan(leaseBeforeRenew);

    // T3/T4 — reclaim races inside the renewed window → reclaim must be a no-op.
    now += Math.floor(LEASE_TTL_MS / 4);
    expect(now).toBeLessThan(renewedExpires);
    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(recovered).toEqual([]);
    expect(
      recovered.some((j) => String(j.jobId) === "job_renew_race_k"),
    ).toBe(false);
    const mid = store.get(asJobId("job_renew_race_k"));
    expect(mid?.status).toBe("running");
    expect(String(mid?.reservedBy)).toBe(String(owner));
    expect(mid?.attempt).toBe(1);
    expect(Date.parse(mid!.leaseExpiresAt!)).toBe(renewedExpires);

    // Second worker must not start a second execution / claim
    let otherExecute = 0;
    const other = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 400;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async () => {
          otherExecute += 1;
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    other.engine.registerWorker("execution", 2);
    await other.engine.tick(1);
    expect(otherExecute).toBe(0);
    expect(
      await store.tryClaim(
        asJobId("job_renew_race_k"),
        asWorkerId("intruder_k"),
        LEASE_TTL_MS,
        new Date(now).toISOString(),
      ),
    ).toBeUndefined();

    // T6/T7 — original execution completes and terminal finalize succeeds
    releaseExecute();
    await tickPromise;
    expect(executeCount).toBe(1);
    expect(otherExecute).toBe(0);
    const terminal = store.get(asJobId("job_renew_race_k"));
    expect(terminal?.status).toBe("completed");
    expect(terminal?.attempt).toBe(1);
    expect(String(terminal?.reservedBy ?? owner)).toBe(String(owner));
  });

  it("K2 — store CAS: concurrent renew before reclaim latest-read makes reclaim no-op", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_cas_k2"));
    let now = Date.parse("2026-09-15T10:30:00.000Z");
    const claimed = await store.tryClaim!(
      asJobId("job_cas_k2"),
      asWorkerId("worker_cas"),
      LEASE_TTL_MS,
      new Date(now).toISOString(),
    );
    expect(claimed?.status).toBe("reserved");
    store.save({ ...claimed!, status: "running", updatedAt: new Date(now).toISOString() });

    // Advance to the exact expiry boundary where reclaim would succeed
    // if the lease were not renewed.
    const expiryMs = Date.parse(claimed!.leaseExpiresAt!);
    now = expiryMs;

    // Renewal first (as happens when heartbeat beats reclaim by CAS).
    const renewOk = await store.renewLease!(
      asJobId("job_cas_k2"),
      LEASE_TTL_MS,
      new Date(now).toISOString(),
      asWorkerId("worker_cas"),
    );
    expect(renewOk).toBe(true);
    const afterRenew = store.get(asJobId("job_cas_k2"))!;
    expect(Date.parse(afterRenew.leaseExpiresAt!)).toBeGreaterThan(expiryMs);
    expect(String(afterRenew.reservedBy)).toBe("worker_cas");
    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(recovered).toEqual([]);
    expect(recovered.some((j) => String(j.jobId) === "job_cas_k2")).toBe(false);
    expect(store.get(asJobId("job_cas_k2"))?.status).toBe("running");
    expect(String(store.get(asJobId("job_cas_k2"))?.reservedBy)).toBe(
      "worker_cas",
    );
  });

  it("L — genuine expiry: reclaim succeeds; original cannot finalize or spawn failover", async () => {
    const store = new InMemoryClaimableJobStore();
    store.save(sampleQueued("job_genuine_loss_l"));

    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((r) => {
      releaseExecute = r;
    });
    let executeCount = 0;
    let now = Date.parse("2026-09-15T11:00:00.000Z");
    let observedOwnershipLost = false;
    let observedCancelled = false;
    let ownerAttempt = -1;

    const platform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 0;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async (job, signal) => {
          executeCount += 1;
          ownerAttempt = job.attempt;
          await executeGate;
          const deadline = Date.now() + 2000;
          while (Date.now() < deadline) {
            if (signal.ownershipLost === true || signal.cancelled === true) {
              observedOwnershipLost = signal.ownershipLost === true;
              observedCancelled = signal.cancelled === true;
              break;
            }
            await new Promise((r) => setTimeout(r, 10));
          }
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    platform.engine.registerWorker("execution", 2);
    const tickPromise = platform.engine.tick(1);

    for (let i = 0; i < 40; i += 1) {
      if (store.get(asJobId("job_genuine_loss_l"))?.status === "running") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const running = store.get(asJobId("job_genuine_loss_l"))!;
    expect(running.status).toBe("running");
    expect(running.reservedBy).toBeTruthy();
    const originalOwner = String(running.reservedBy);

    // Force lease into the past and disable further renewals
    await store.renewLease!(
      running.jobId,
      0,
      new Date(now - 10).toISOString(),
      running.reservedBy,
    );
    store.renewLease = async () => false;

    const recovered = await store.reclaimExpired!(
      new Date(now).toISOString(),
      now,
    );
    expect(recovered.some((j) => String(j.jobId) === "job_genuine_loss_l")).toBe(
      true,
    );
    const afterReclaim = store.get(asJobId("job_genuine_loss_l"))!;
    expect(afterReclaim.status).toBe("queued");
    expect(afterReclaim.reservedBy).toBeUndefined();
    expect(afterReclaim.leaseExpiresAt).toBeUndefined();
    expect(afterReclaim.attempt).toBe(running.attempt);

    releaseExecute();
    await tickPromise;

    expect(executeCount).toBe(1);
    expect(observedOwnershipLost || observedCancelled).toBe(true);
    expect(observedOwnershipLost).toBe(true);
    // Original path must not finalize terminal success after ownership loss
    expect(store.get(asJobId("job_genuine_loss_l"))?.status).not.toBe(
      "completed",
    );
    expect(store.get(asJobId("job_genuine_loss_l"))?.status).toBe("queued");
    expect(store.get(asJobId("job_genuine_loss_l"))?.attempt).toBe(ownerAttempt);
    // Original owner must not still hold durable reservation
    expect(store.get(asJobId("job_genuine_loss_l"))?.reservedBy).toBeUndefined();

    // Recovered worker may continue per normal retry/claim policy
    let recoveredExecute = 0;
    let recoveredOwner = "";
    const recoveredPlatform = createDistributedExecutionPlatform({
      jobStore: store,
      leaseTtlMs: LEASE_TTL_MS,
      clockMs: () => now,
      nowIso: () => new Date(now).toISOString(),
      createId: (() => {
        let n = 500;
        return (p: string) => `${p}_${++n}`;
      })(),
      executor: {
        execute: async (job) => {
          recoveredExecute += 1;
          recoveredOwner = String(job.reservedBy ?? "");
          return {
            ok: true as const,
            value: { summary: { success: true }, durationMs: 1 },
          };
        },
      },
    });
    recoveredPlatform.engine.registerWorker("execution", 2);
    await recoveredPlatform.engine.tick(1);
    expect(recoveredExecute).toBe(1);
    expect(store.get(asJobId("job_genuine_loss_l"))?.status).toBe("completed");
    expect(store.get(asJobId("job_genuine_loss_l"))?.attempt).toBe(
      ownerAttempt + 1,
    );
    // Recovered execution is a new claim — not the original owner's silent overwrite
    expect(recoveredOwner.length).toBeGreaterThan(0);
    expect(recoveredOwner).not.toBe(originalOwner);
  });
});
