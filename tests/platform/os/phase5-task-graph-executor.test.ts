/**
 * Phase 5 — Task Graph Executor unit tests.
 */

import {
  createExecutionIntelligenceOsEngine,
  createProductionNegotiationPlatform,
  createTaskGraphExecutorEngine,
  ControllableTaskCapabilityRunner,
  InMemoryTaskGraphRunStore,
  canTransitionTaskStatus,
  TaskGraphExecutorError,
  selectParallelEligible,
  selectRunnableTaskIds,
} from "../../../src/platform/os";
import { createBriefIntelligenceEngine } from "../../../src/platform/os/brief";
import type { ExecutionPlan } from "../../../src/platform/os/execution-intelligence";
import type { TaskNodeState } from "../../../src/platform/os/task-graph-executor";

function makePlan(prompt: string, exec = "exec_p5"): ExecutionPlan {
  const brief = createBriefIntelligenceEngine().createBrief({
    tenant: {
      organizationId: "org_a",
      requestId: "req_1",
      executionId: exec,
    },
    rawPrompt: prompt,
    clientCapabilityId: "text.generate",
  });
  return createExecutionIntelligenceOsEngine({
    capabilityRegistry: createProductionNegotiationPlatform().capabilityRegistry,
  }).createPlan({
    organizationId: "org_a",
    executionId: exec,
    requestId: "req_1",
    brief: { ...brief, executionId: exec },
  });
}

describe("Phase 5 — task state machine", () => {
  it("allows PENDING → READY → RUNNING → SUCCEEDED", () => {
    expect(canTransitionTaskStatus("PENDING", "READY")).toBe(true);
    expect(canTransitionTaskStatus("READY", "RUNNING")).toBe(true);
    expect(canTransitionTaskStatus("RUNNING", "SUCCEEDED")).toBe(true);
  });

  it("rejects SUCCEEDED → RUNNING", () => {
    expect(canTransitionTaskStatus("SUCCEEDED", "RUNNING")).toBe(false);
  });
});

describe("Phase 5 — TaskGraphExecutor", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("single-task execution succeeds and persists output", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const store = new InMemoryTaskGraphRunStore();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan("Write a caption for my product.", "exec_one");
    expect(plan.status).toBe("APPROVED_FOR_EXECUTION");

    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_one",
      requestId: "req_1",
      plan,
      maxConcurrency: 2,
    });

    expect(snap.status).toBe("SUCCEEDED");
    expect(snap.tasks).toHaveLength(1);
    expect(snap.tasks[0]!.status).toBe("SUCCEEDED");
    expect(snap.tasks[0]!.outputRef?.preview).toMatch(/Simulated output/);
    expect(snap.planVersion).toBe(plan.planVersion);
  });

  it("rejects DRAFT/BLOCKED/INVALID plans", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
    });
    const plan = makePlan("Write a caption.", "exec_reject");
    const blocked = { ...plan, status: "BLOCKED" as const };
    await expect(
      engine.execute({
        organizationId: "org_a",
        executionId: "exec_reject",
        requestId: "req",
        plan: blocked,
      })
    ).rejects.toBeInstanceOf(TaskGraphExecutorError);
  });

  it("campaign DAG: sequential spine then parallel leaves", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const delays = new Map<string, number>();
    for (const key of [
      "campaign_strategy",
      "messaging_framework",
      "creative_direction",
      "instagram_content",
      "meta_ad_variants",
      "landing_page",
    ]) {
      runner.onTask(key, async (input) => {
        delays.set(key, Date.now());
        await new Promise((r) => setTimeout(r, key.includes("instagram") || key.includes("meta") || key.includes("landing") ? 40 : 5));
        return {
          ok: true,
          retryable: false,
          preview: `ok:${input.task.taskKey} deliverable with Hero CTA Benefits — Learn more about the product launch.`,
        };
      });
    }

    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
      defaultMaxConcurrency: 3,
    });
    const plan = makePlan(
      "Create a complete product launch campaign with Instagram content, Meta ads and a landing page.",
      "exec_camp"
    );
    expect(plan.planType).toBe("campaign");

    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_camp",
      requestId: "req",
      plan,
      maxConcurrency: 3,
    });

    expect(snap.status).toBe("SUCCEEDED");
    expect(snap.tasks.every((t) => t.status === "SUCCEEDED")).toBe(true);
    expect(runner.getMaxObservedConcurrency()).toBeGreaterThanOrEqual(2);

    const order = runner.getStartedOrder();
    const strategyIdx = order.indexOf("campaign_strategy");
    const messagingIdx = order.indexOf("messaging_framework");
    const creativeIdx = order.indexOf("creative_direction");
    expect(strategyIdx).toBeLessThan(messagingIdx);
    expect(messagingIdx).toBeLessThan(creativeIdx);
    expect(creativeIdx).toBeLessThan(order.indexOf("instagram_content"));
  });

  it("dependency failure blocks descendants", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    runner.onTask("creative_direction", async () => ({
      ok: false,
      retryable: false,
      failureClass: "validation",
      errorCode: "TASK_EXECUTION_FAILED",
      errorMessage: "creative failed permanently",
    }));

    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
      defaultMaxAttempts: 1,
    });
    const plan = makePlan(
      "Create a complete product launch campaign with Instagram content, Meta ads and a landing page.",
      "exec_fail"
    );

    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_fail",
      requestId: "req",
      plan,
    });

    expect(["FAILED", "PARTIALLY_SUCCEEDED", "BLOCKED"]).toContain(snap.status);
    const creative = snap.tasks.find((t) => t.taskKey === "creative_direction")!;
    expect(creative.status).toBe("FAILED");
    for (const leaf of ["instagram_content", "meta_ad_variants", "landing_page"]) {
      const n = snap.tasks.find((t) => t.taskKey === leaf)!;
      expect(["BLOCKED", "SKIPPED", "PENDING"]).toContain(n.status);
      expect(n.status).not.toBe("SUCCEEDED");
      expect(n.status).not.toBe("RUNNING");
    }
  });

  it("retries transient failures then succeeds", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    let tries = 0;
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
      defaultMaxAttempts: 3,
    });
    const plan = makePlan("Write a caption for sneakers.", "exec_retry");
    const key = plan.tasks[0]!.taskKey;
    runner.onTask(key, async () => {
      tries += 1;
      if (tries < 2) {
        return {
          ok: false,
          retryable: true,
          failureClass: "transient",
          errorCode: "TASK_EXECUTION_FAILED",
          errorMessage: "temporary glitch",
        };
      }
      return { ok: true, retryable: false, preview: "recovered" };
    });

    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_retry",
      requestId: "req",
      plan,
    });
    expect(snap.status).toBe("SUCCEEDED");
    expect(tries).toBeGreaterThanOrEqual(2);
  });

  it("does not retry contract violations", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const plan = makePlan("Write a caption.", "exec_contract");
    let calls = 0;
    runner.onTask(plan.tasks[0]!.taskKey, async () => {
      calls += 1;
      return {
        ok: false,
        retryable: false,
        failureClass: "contract",
        errorCode: "TASK_OUTPUT_CONTRACT_VIOLATION",
        errorMessage: "bad output",
      };
    });
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
      defaultMaxAttempts: 5,
    });
    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_contract",
      requestId: "req",
      plan,
    });
    expect(snap.tasks[0]!.status).toBe("FAILED");
    expect(calls).toBe(1);
  });

  it("idempotent execute returns same terminal snapshot", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const store = new InMemoryTaskGraphRunStore();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan("Write a caption.", "exec_idem");
    const a = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_idem",
      requestId: "req",
      plan,
    });
    const b = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_idem",
      requestId: "req",
      plan,
    });
    expect(a.status).toBe("SUCCEEDED");
    expect(b.runId).toBe(a.runId);
    expect(runner.getStartedOrder().length).toBe(1);
  });

  it("resume does not rerun succeeded tasks", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const store = new InMemoryTaskGraphRunStore();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan("Write a caption.", "exec_resume");
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_resume",
      requestId: "req",
      plan,
    });
    const before = runner.getStartedOrder().length;
    const resumed = await engine.resume({
      organizationId: "org_a",
      executionId: "exec_resume",
      requestId: "req",
      plan,
    });
    expect(resumed.status).toBe("SUCCEEDED");
    expect(runner.getStartedOrder().length).toBe(before);
  });

  it("cancel prevents further work", async () => {
    const runner = new ControllableTaskCapabilityRunner();
    const store = new InMemoryTaskGraphRunStore();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan(
      "Create a complete product launch campaign with Instagram content, Meta ads and a landing page.",
      "exec_cancel"
    );
    // Slow strategy so we can cancel
    runner.onTask("campaign_strategy", async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, retryable: false, preview: "strategy" };
    });

    const execPromise = engine.execute({
      organizationId: "org_a",
      executionId: "exec_cancel",
      requestId: "req",
      plan,
      maxConcurrency: 1,
    });
    await new Promise((r) => setTimeout(r, 20));
    const cancelled = await engine.cancel({
      organizationId: "org_a",
      executionId: "exec_cancel",
      reason: "user_cancel",
    });
    expect(cancelled.cancelRequested || cancelled.status === "CANCELLED").toBe(
      true
    );
    await execPromise;
    const final = await engine.getStatus({
      organizationId: "org_a",
      executionId: "exec_cancel",
    });
    expect(final?.status).toBe("CANCELLED");
  });

  it("tenant mismatch fails closed", async () => {
    const engine = createTaskGraphExecutorEngine({
      runner: new ControllableTaskCapabilityRunner(),
      capabilityRegistry: caps,
      store: new InMemoryTaskGraphRunStore(),
    });
    const plan = makePlan("Write a caption.", "exec_tenant");
    await expect(
      engine.execute({
        organizationId: "org_other",
        executionId: "exec_tenant",
        requestId: "req",
        plan,
      })
    ).rejects.toMatchObject({ code: "TENANT_VIOLATION" });
  });

  it("plan version is immutable for a running execution", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const engine = createTaskGraphExecutorEngine({
      runner: new ControllableTaskCapabilityRunner(),
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan("Write a caption.", "exec_ver");
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_ver",
      requestId: "req",
      plan,
    });
    const v2 = { ...plan, planVersion: plan.planVersion + 1 };
    await expect(
      engine.execute({
        organizationId: "org_a",
        executionId: "exec_ver",
        requestId: "req",
        plan: v2,
      })
    ).rejects.toMatchObject({ code: "PLAN_VERSION_MISMATCH" });
  });

  it("scheduler marks independent leaves parallel-eligible", () => {
    const plan = makePlan(
      "Create a complete product launch campaign with Instagram content, Meta ads and a landing page.",
      "exec_par"
    );
    const creative = plan.tasks.find((t) => t.taskKey === "creative_direction")!;
    const nodes = new Map<string, TaskNodeState>();
    for (const t of plan.tasks) {
      const status =
        t.taskId === creative.taskId ||
        plan.tasks.some(
          (x) =>
            x.taskId !== t.taskId &&
            t.dependencies.includes(x.taskId) === false &&
            creative.dependencies.every((d) =>
              plan.tasks.find((p) => p.taskId === d)
            )
        )
          ? "PENDING"
          : "PENDING";
      nodes.set(t.taskId, {
        taskId: t.taskId,
        taskKey: t.taskKey,
        status:
          t.dependencies.length === 0 ||
          t.dependencies.every((d) => d === creative.taskId)
            ? t.taskKey === "creative_direction"
              ? "SUCCEEDED"
              : t.dependencies.includes(creative.taskId)
                ? "PENDING"
                : "SUCCEEDED"
            : "SUCCEEDED",
        attempt: 0,
        maxAttempts: 3,
        attempts: [],
        updatedAt: "t",
      });
    }
    // Mark all upstream of creative succeeded, creative succeeded
    for (const t of plan.tasks) {
      if (
        t.taskKey === "campaign_strategy" ||
        t.taskKey === "messaging_framework" ||
        t.taskKey === "creative_direction" ||
        t.taskKey === "research_product_information"
      ) {
        nodes.set(t.taskId, {
          ...nodes.get(t.taskId)!,
          status: "SUCCEEDED",
        });
      }
    }
    const runnable = selectRunnableTaskIds(plan, nodes, {
      cancelRequested: false,
    });
    const parallel = selectParallelEligible(runnable, plan);
    expect(parallel.length).toBeGreaterThanOrEqual(2);
    expect(
      parallel
        .map((id) => plan.tasks.find((t) => t.taskId === id)!.taskKey)
        .sort()
    ).toEqual(
      expect.arrayContaining([
        "instagram_content",
        "meta_ad_variants",
        "landing_page",
      ])
    );
  });
});
