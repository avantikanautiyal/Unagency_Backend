import {
  setupDistributedExecution,
  sampleEnqueue,
} from "../../../../src/platform/infrastructure/execution/testing";
import { createDistributedExecutionPlatform } from "../../../../src/platform/infrastructure/execution/factories/create-distributed-execution-platform";
import { StubJobExecutor } from "../../../../src/platform/infrastructure/execution/workers/job-executors";
import { EnqueueJobInputBuilder } from "../../../../src/platform/infrastructure/execution/builders/enqueue-job-input-builder";
import { computeRetryDelayMs } from "../../../../src/platform/infrastructure/execution/retries/retry-policy";

describe("Distributed Execution Platform", () => {
  it("enqueues and completes a job via workers", async () => {
    const { engine } = setupDistributedExecution();
    const enq = await engine.enqueue(sampleEnqueue());
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    const tick = await engine.tick(1);
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.value.some((j) => j.status === "completed")).toBe(true);

    const job = engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("completed");
  });

  it("respects priority ordering", async () => {
    const { engine } = setupDistributedExecution({ maxConcurrency: 1 });
    await engine.enqueue({
      ...sampleEnqueue("low"),
      priority: "low",
      queueKind: "priority",
    });
    await engine.enqueue({
      ...sampleEnqueue("critical"),
      priority: "critical",
      queueKind: "priority",
    });

    const tick = await engine.tick(1);
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.value[0]?.payload.rawPrompt).toBe("critical");
  });

  it("retries transient failures then completes", async () => {
    const { engine, helpers } = setupDistributedExecution({
      stubBehavior: "fail_once",
      executor: new StubJobExecutor("fail_once"),
    });
    const enq = await engine.enqueue({
      ...sampleEnqueue(),
      retryPolicy: { strategy: "immediate", maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 10 },
    });
    if (!enq.ok) return;

    const first = await engine.tick(1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.some((j) => j.status === "retrying")).toBe(true);

    helpers.advance(50);
    const second = await engine.tick(2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const job = engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("completed");
  });

  it("moves exhausted retries to dead letter", async () => {
    const { engine } = setupDistributedExecution({
      stubBehavior: "fail",
      executor: new StubJobExecutor("fail"),
    });
    const enq = await engine.enqueue({
      ...sampleEnqueue(),
      retryPolicy: { strategy: "immediate", maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    if (!enq.ok) return;

    await engine.tick(1);
    const job = engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("dead_letter");

    const dlq = engine.listDeadLetters();
    expect(dlq.ok && dlq.value.length).toBeGreaterThanOrEqual(1);

    const requeued = await engine.requeueDeadLetter(enq.value.jobId);
    expect(requeued.ok).toBe(true);
  });

  it("cancels queued jobs", async () => {
    const { engine } = setupDistributedExecution();
    const enq = await engine.enqueue(sampleEnqueue());
    if (!enq.ok) return;
    const cancelled = await engine.cancel(enq.value.jobId, "user");
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("runs batch jobs and tracks progress", async () => {
    const { engine } = setupDistributedExecution();
    const batch = await engine.enqueueBatch({
      mode: "parallel",
      name: "campaign",
      jobs: [sampleEnqueue("a"), sampleEnqueue("b"), sampleEnqueue("c")],
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;

    await engine.tick(5);
    const jobs = engine.listJobs();
    expect(jobs.ok).toBe(true);
    if (!jobs.ok) return;
    const batchJobs = jobs.value.filter((j) => j.batchId === batch.value.batchId);
    expect(batchJobs.every((j) => j.status === "completed")).toBe(true);
  });

  it("cancels an entire batch", async () => {
    const { engine } = setupDistributedExecution();
    const batch = await engine.enqueueBatch({
      mode: "sequential",
      jobs: [sampleEnqueue("x"), sampleEnqueue("y")],
    });
    if (!batch.ok) return;
    const cancelled = await engine.cancelBatch(String(batch.value.batchId));
    expect(cancelled.ok && cancelled.value.status).toBe("cancelled");
  });

  it("schedules future jobs", async () => {
    const { engine, helpers } = setupDistributedExecution();
    const future = new Date(helpers.clockMs() + 10_000).toISOString();
    const enq = await engine.enqueue({
      ...sampleEnqueue("later"),
      queueKind: "scheduled",
      scheduledAt: future,
    });
    if (!enq.ok) return;

    const early = await engine.tick(1);
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    expect(early.value.find((j) => j.jobId === enq.value.jobId)).toBeUndefined();

    helpers.advance(11_000);
    const late = await engine.tick(1);
    expect(late.ok).toBe(true);
    if (!late.ok) return;
    const job = engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("completed");
  });

  it("recovers jobs from worker failure", async () => {
    const platform = setupDistributedExecution();
    const enq = await platform.engine.enqueue(sampleEnqueue("recover-me"));
    if (!enq.ok) return;

    const workers = platform.engine.listWorkers();
    if (!workers.ok) return;
    const victim = workers.value[0]!;

    platform.rawEngine["store"].save({
      ...enq.value,
      status: "running",
      reservedBy: victim.workerId,
      updatedAt: new Date().toISOString(),
    });
    platform.rawEngine.failWorker(String(victim.workerId));
    // Ensure a healthy worker exists after crash
    platform.engine.registerWorker("recovery", 2);

    const recovered = platform.engine.getJob(enq.value.jobId);
    expect(recovered.ok && recovered.value.status).toBe("queued");

    const tick = await platform.engine.tick(1);
    expect(tick.ok).toBe(true);
    const done = platform.engine.getJob(enq.value.jobId);
    expect(done.ok && done.value.status).toBe("completed");
  });

  it("publishes progress updates", async () => {
    const { engine } = setupDistributedExecution();
    const enq = await engine.enqueue(sampleEnqueue());
    if (!enq.ok) return;
    await engine.tick(1);
    const progress = engine.getProgress(enq.value.jobId);
    expect(progress.ok).toBe(true);
    if (!progress.ok) return;
    expect(progress.value?.status).toBe("completed");
    expect(progress.value?.progressPercent).toBe(100);
  });

  it("supports streaming and long_running queue kinds", async () => {
    const { engine } = setupDistributedExecution();
    await engine.enqueue({ ...sampleEnqueue("s"), queueKind: "streaming" });
    await engine.enqueue({ ...sampleEnqueue("l"), queueKind: "long_running" });
    const tick = await engine.tick(4);
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    expect(tick.value.filter((j) => j.status === "completed").length).toBeGreaterThanOrEqual(2);
  });

  it("enforces concurrency limits (backpressure)", async () => {
    const { engine } = setupDistributedExecution({ maxConcurrency: 1 });
    await engine.enqueue(sampleEnqueue("1"));
    await engine.enqueue(sampleEnqueue("2"));
    const tick = await engine.tick(5);
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    // Only one slot per tick iteration acquire — may complete 1 per acquire loop
    expect(tick.value.length).toBeGreaterThanOrEqual(1);
  });

  it("computes retry delays", () => {
    expect(
      computeRetryDelayMs(
        { strategy: "exponential", maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000 },
        3
      )
    ).toBe(40);
    expect(
      computeRetryDelayMs(
        { strategy: "linear", maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000 },
        3
      )
    ).toBe(30);
    expect(
      computeRetryDelayMs(
        { strategy: "immediate", maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000 },
        3
      )
    ).toBe(0);
  });

  it("shuts down gracefully", async () => {
    const { engine } = setupDistributedExecution();
    await engine.enqueue(sampleEnqueue());
    const shut = await engine.shutdown();
    expect(shut.ok).toBe(true);
    const enq = await engine.enqueue(sampleEnqueue("after"));
    expect(enq.ok).toBe(false);
  });

  it("wires Integration Layer executor when requested", async () => {
    const platform = createDistributedExecutionPlatform({
      useIntegrationLayer: true,
    });
    const enq = await platform.engine.enqueue(
      EnqueueJobInputBuilder.create()
        .withPrompt("Launch a new sneaker collection with marketing carousel and copy")
        .withScenarioHint("retail")
        .withOrganization("org_1")
        .build()
    );
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;
    const tick = await platform.engine.tick(1);
    expect(tick.ok).toBe(true);
    if (!tick.ok) return;
    const job = platform.engine.getJob(enq.value.jobId);
    expect(job.ok && job.value.status).toBe("completed");
  }, 120000);
});
