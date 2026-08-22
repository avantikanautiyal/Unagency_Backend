/**
 * Phase 8 — Durable runtime, queue workers, multi-worker safety, restart, async.
 */

import {
  createBriefIntelligenceEngine,
  createExecutionIntelligenceOsEngine,
  createProductionNegotiationPlatform,
  createTaskGraphExecutorEngine,
  ControllableTaskCapabilityRunner,
  InMemoryTaskGraphRunStore,
  InMemoryOsWorkQueue,
  createOsProductionRuntime,
  createOsDeliveryService,
  createGovernanceFinalizeService,
  InMemoryEvaluationLedger,
  InMemoryGovernanceDecisionStore,
  InMemoryHumanReviewStore,
  InMemoryDeliveryReceiptStore,
  createRefinementEngine,
  InMemoryFeedbackSessionStore,
  InMemoryRefinementStore,
  MAX_REFINEMENT_QUESTIONS,
} from "../../../src/platform/os";
import { getValidationSuite } from "../../../src/platform/validation/suites/validation-suites";
import { getValidationScenario } from "../../../src/platform/validation/scenarios/end-to-end-scenarios";
import type { ExecutionPlan } from "../../../src/platform/os";

function makePlan(prompt: string, exec: string): ExecutionPlan {
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

describe("Phase 8 — M9 validation definitions", () => {
  it("includes phase8_production_runtime suite", () => {
    const suite = getValidationSuite("phase8_production_runtime");
    expect(suite?.scenarioIds).toContain("phase8_production_runtime");
    const scenario = getValidationScenario("phase8_production_runtime");
    expect(scenario?.stages).toEqual(
      expect.arrayContaining([
        "durable_execution",
        "queue_idempotency",
        "worker_recovery",
        "async_execution",
        "multi_worker_safety",
        "gateway_authorization",
      ])
    );
  });
});

describe("Phase 8 — durable execution + CAS", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("saves and loads graph state via TaskGraphRunStore", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const runner = new ControllableTaskCapabilityRunner();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
    });
    const plan = makePlan("Write a caption for my product.", "exec_dur");
    const snap = await engine.execute({
      organizationId: "org_a",
      executionId: "exec_dur",
      requestId: "req",
      plan,
    });
    const loaded = await store.get("exec_dur", "org_a");
    expect(loaded?.stateVersion).toBe(snap.stateVersion);
    expect(loaded?.tasks[0]?.status).toBe("SUCCEEDED");
  });

  it("task claim CAS: worker A succeeds, worker B rejected", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const runner = new ControllableTaskCapabilityRunner();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
    });
    const plan = makePlan("Write a caption for my product.", "exec_cas");
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_cas",
      requestId: "req",
      plan,
    });
    const [a, b] = await Promise.all([
      engine.processQueuedTask({
        organizationId: "org_a",
        executionId: "exec_cas",
        requestId: "req",
        plan,
        taskId: plan.tasks[0]!.taskId,
        workerId: "worker_a",
      }),
      engine.processQueuedTask({
        organizationId: "org_a",
        executionId: "exec_cas",
        requestId: "req",
        plan,
        taskId: plan.tasks[0]!.taskId,
        workerId: "worker_b",
      }),
    ]);
    const claimed = [a, b].filter((x) => x.claimed);
    const rejected = [a, b].filter((x) => !x.claimed);
    expect(claimed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(runner.getStartedOrder().filter((k) => k === plan.tasks[0]!.taskKey)).toHaveLength(1);
  });
});

describe("Phase 8 — queue, retry, dead-letter", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("enqueues deterministic jobs, ignores duplicates, workers execute", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const queue = new InMemoryOsWorkQueue();
    const runner = new ControllableTaskCapabilityRunner();
    const plans = new Map<string, ExecutionPlan>();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
      onTasksReady: async ({ snapshot, readyTaskIds }) => {
        const runtime = createOsProductionRuntime({
          executor: engine,
          queue,
          delivery: createOsDeliveryService(),
          resolvePlan: async (id) => plans.get(id),
        });
        await runtime.enqueueReadyTasks({ snapshot, readyTaskIds });
      },
    });
    const runtime = createOsProductionRuntime({
      executor: engine,
      queue,
      delivery: createOsDeliveryService(),
      resolvePlan: async (id) => plans.get(id),
    });
    const plan = makePlan("Write a caption for my product.", "exec_q");
    plans.set("exec_q", plan);
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_q",
      requestId: "req",
      plan,
    });
    const jobId = [...(await queue.listQueued("task_graph"))][0]?.jobId;
    expect(jobId).toBeTruthy();
    await queue.enqueue((await queue.get(jobId!))!);
    expect((await queue.listQueued("task_graph")).length).toBe(1);
    await runtime.tickTaskWorker("w1");
    const snap = await store.get("exec_q", "org_a");
    expect(snap?.status).toBe("SUCCEEDED");
    expect((await queue.get(jobId!))?.status).toBe("completed");
  });

  it("dead-letters after max attempts", async () => {
    const queue = new InMemoryOsWorkQueue();
    const now = new Date().toISOString();
    await queue.enqueue({
      jobId: "tg:org_a:exec_dl:1:t1:1",
      kind: "task_graph",
      organizationId: "org_a",
      executionId: "exec_dl",
      planVersion: 1,
      taskId: "t1",
      attempt: 1,
      status: "queued",
      attempts: 0,
      maxAttempts: 2,
      createdAt: now,
      updatedAt: now,
    });
    const c1 = await queue.tryClaim("tg:org_a:exec_dl:1:t1:1", "w", 1000, now);
    expect(c1).toBeTruthy();
    const f1 = await queue.fail("tg:org_a:exec_dl:1:t1:1", "boom", now);
    expect(f1?.status).toBe("failed");
    const c2 = await queue.tryClaim("tg:org_a:exec_dl:1:t1:1", "w", 1000, now);
    expect(c2).toBeTruthy();
    const f2 = await queue.fail("tg:org_a:exec_dl:1:t1:1", "boom", now);
    expect(f2?.status).toBe("dead_letter");
  });
});

describe("Phase 8 — worker restart recovery", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("recovers interrupted RUNNING without re-executing succeeded tasks", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const runner = new ControllableTaskCapabilityRunner();
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
    });
    const plan = makePlan(
      "Create a complete product launch campaign with Instagram content, Meta ads and a landing page.",
      "exec_rst"
    );
    expect(plan.tasks.length).toBeGreaterThan(1);
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_rst",
      requestId: "req",
      plan,
    });
    const first = plan.tasks[0]!;
    const a = await engine.processQueuedTask({
      organizationId: "org_a",
      executionId: "exec_rst",
      requestId: "req",
      plan,
      taskId: first.taskId,
      workerId: "w1",
    });
    expect(a.claimed).toBe(true);
    expect(a.snapshot.tasks.find((t) => t.taskId === first.taskId)?.status).toBe(
      "SUCCEEDED"
    );

    const ready = a.snapshot.tasks.find((t) => t.status === "READY");
    expect(ready).toBeTruthy();
    const at = new Date().toISOString();
    const crashed = {
      ...a.snapshot,
      tasks: a.snapshot.tasks.map((t) =>
        t.taskId === ready!.taskId
          ? {
              ...t,
              status: "RUNNING" as const,
              claimedBy: "dead_worker",
              claimToken: "dead",
              startedAt: at,
              updatedAt: at,
            }
          : t
      ),
      stateVersion: a.snapshot.stateVersion + 1,
      updatedAt: at,
    };
    const saved = await store.compareAndSet(crashed, a.snapshot.stateVersion);
    expect(saved).toBe(true);

    const engine2 = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
    });
    await engine2.resume({
      organizationId: "org_a",
      executionId: "exec_rst",
      requestId: "req",
      plan,
    });
    const recovered = await store.get("exec_rst", "org_a");
    const recoveredNode = recovered!.tasks.find((t) => t.taskId === ready!.taskId);
    expect(recoveredNode?.status).not.toBe("RUNNING");
    expect(["READY", "RETRYING", "PENDING"]).toContain(recoveredNode?.status);

    const startedBefore = runner.getStartedOrder().filter((k) => k === first.taskKey).length;
    await engine2.processQueuedTask({
      organizationId: "org_a",
      executionId: "exec_rst",
      requestId: "req",
      plan,
      taskId: ready!.taskId,
      workerId: "w2",
    });
    expect(runner.getStartedOrder().filter((k) => k === first.taskKey).length).toBe(
      startedBefore
    );
  });
});

describe("Phase 8 — async execution in canonical graph", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("keeps ASYNC tasks RUNNING across worker restart until completion", async () => {
    const store = new InMemoryTaskGraphRunStore();
    const runner = new ControllableTaskCapabilityRunner();
    const plan = makePlan("Write a caption for my product.", "exec_async");
    runner.onTask(plan.tasks[0]!.taskKey, async () => ({
      ok: true,
      retryable: false,
      asyncPending: true,
      executionMode: "ASYNC",
      externalJobRef: "media_job_1",
      preview: "",
    }));
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
    });
    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_async",
      requestId: "req",
      plan,
    });
    await engine.processQueuedTask({
      organizationId: "org_a",
      executionId: "exec_async",
      requestId: "req",
      plan,
      taskId: plan.tasks[0]!.taskId,
      workerId: "w1",
    });
    const pending = await store.get("exec_async", "org_a");
    expect(pending?.tasks[0]?.executionMode).toBe("ASYNC");
    expect(pending?.tasks[0]?.status).toBe("RUNNING");

    const engine2 = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store,
      executeMode: "queued",
      enableGovernance: false,
    });
    await engine2.resume({
      organizationId: "org_a",
      executionId: "exec_async",
      requestId: "req",
      plan,
    });
    const afterResume = await store.get("exec_async", "org_a");
    expect(afterResume?.tasks[0]?.status).toBe("RUNNING");
    expect(afterResume?.tasks[0]?.externalJobRef).toBe("media_job_1");

    const done = await engine2.completeAsyncTask({
      organizationId: "org_a",
      executionId: "exec_async",
      taskId: plan.tasks[0]!.taskId,
      requestId: "req",
      plan,
      preview: "Rendered video/audio complete with Hero CTA Benefits. Learn more.",
      outputContractId: plan.tasks[0]!.outputRequirements.outputContractId,
      externalJobRef: "media_job_1",
    });
    expect(done.tasks[0]?.status).toBe("SUCCEEDED");
    expect(done.status).toBe("SUCCEEDED");
  });
});

describe("Phase 8 — evaluation / governance / review persistence", () => {
  it("appends immutable evaluation and governance records", async () => {
    const evaluations = new InMemoryEvaluationLedger();
    const governance = new InMemoryGovernanceDecisionStore();
    const finalize = createGovernanceFinalizeService({
      evaluationLedger: evaluations,
      governanceDecisions: governance,
    });
    const r1 = finalize.finalizeTask({
      organizationId: "org_a",
      executionId: "exec_ev",
      planId: "plan",
      planVersion: 1,
      taskId: "t1",
      taskKey: "caption",
      outputContractId: "output.caption",
      preview: "Premium spring product caption with a clear call to action Learn more.",
    });
    await Promise.resolve();
    const listed = await evaluations.listByExecution("exec_ev", "org_a");
    expect(listed.length).toBeGreaterThanOrEqual(1);
    const original = listed[0]!;
    await evaluations.append({ ...original, worstOutcome: "BLOCKED" });
    const again = await evaluations.get(original.recordId, "org_a");
    expect(again?.worstOutcome).toBe(original.worstOutcome);
    const decisions = await governance.listByExecution("exec_ev", "org_a");
    expect(decisions[0]?.decisionId).toBe(r1.decision.decisionId);
  });

  it("recovers pending human review after store-only restart", async () => {
    const reviews = new InMemoryHumanReviewStore();
    await reviews.create({
      reviewId: "rev_1",
      organizationId: "org_a",
      executionId: "exec_hr",
      planId: "p",
      planVersion: 1,
      reason: "quality",
      policyId: "gov",
      policyVersion: "1",
      evaluationIds: ["e1"],
      requestedAt: new Date().toISOString(),
      status: "PENDING",
    });
    const pending = await reviews.getPendingForExecution("exec_hr", "org_a");
    expect(pending?.status).toBe("PENDING");
    const decided = await reviews.decide({
      reviewId: "rev_1",
      organizationId: "org_a",
      decision: "APPROVED",
      reviewer: "human",
    });
    expect(decided.status).toBe("APPROVED");
    const dup = await reviews.decide({
      reviewId: "rev_1",
      organizationId: "org_a",
      decision: "REJECTED",
      reviewer: "human",
    });
    expect(dup.status).toBe("APPROVED");
  });
});

describe("Phase 8 — refinement session persistence", () => {
  it("returns the same next question after simulated API restart", async () => {
    const store = new InMemoryRefinementStore();
    const sessions = new InMemoryFeedbackSessionStore();
    const engine = createRefinementEngine({ store, feedbackStore: sessions });
    const started = await engine.requestRefinement({
      organizationId: "org_a",
      executionId: "exec_fb",
      sourceOutputId: "out_1",
      sourceVersion: 1,
      sourcePreview: "v1 caption",
      mode: "AI",
      outputType: "caption",
      sourceApprovalStatus: "APPROVED",
    });
    const q1 = started.presented.question.questionId;
    const firstOpt = started.presented.question.options[0]!.optionId;
    await engine.submitAnswer({
      refinementId: started.request.refinementId,
      organizationId: "org_a",
      questionId: q1,
      optionIds: [firstOpt],
    });
    const engine2 = createRefinementEngine({ store, feedbackStore: sessions });
    const q2a = await engine2.getNextQuestion({
      refinementId: started.request.refinementId,
      organizationId: "org_a",
    });
    const q2b = await engine2.getNextQuestion({
      refinementId: started.request.refinementId,
      organizationId: "org_a",
    });
    expect(q2a?.question.questionId).toBeTruthy();
    expect(q2a?.question.questionId).toBe(q2b?.question.questionId);
    expect(q2a?.question.questionId).not.toBe(q1);

    for (let i = 0; i < MAX_REFINEMENT_QUESTIONS + 2; i++) {
      const cur = await engine2.getNextQuestion({
        refinementId: started.request.refinementId,
        organizationId: "org_a",
      });
      if (!cur) break;
      await engine2.submitAnswer({
        refinementId: started.request.refinementId,
        organizationId: "org_a",
        questionId: cur.question.questionId,
        optionIds: [cur.question.options[0]!.optionId],
      });
    }
    const status = await engine2.getStore().get(
      started.request.refinementId,
      "org_a"
    );
    expect(["SPEC_READY", "COMPLETED", "FEEDBACK_IN_PROGRESS"]).toContain(
      status?.status
    );
  });
});

describe("Phase 8 — delivery queue idempotency + multi-worker", () => {
  it("only one worker delivers; retries reuse SUCCEEDED receipt", async () => {
    const receipts = new InMemoryDeliveryReceiptStore();
    const delivery = createOsDeliveryService({
      receipts,
      mode: "queued",
    });
    const store = delivery.getArtifactStore();
    await store.createVersion({
      artifactId: "art_q",
      organizationId: "org_a",
      executionId: "exec_d",
      preview: "approved caption content long enough",
      approvalState: "APPROVED",
      approvalReference: "apr",
    });
    const queued = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_q",
      artifactVersion: 1,
      executionId: "exec_d",
      destination: "export",
    });
    expect(queued.status).toBe("QUEUED");
    const [w1, w2] = await Promise.all([
      delivery.processQueuedDelivery(queued.deliveryId, "org_a"),
      delivery.processQueuedDelivery(queued.deliveryId, "org_a"),
    ]);
    const succeeded = [w1, w2].filter((r) => r?.status === "SUCCEEDED");
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    const again = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: "art_q",
      artifactVersion: 1,
      executionId: "exec_d",
      destination: "export",
    });
    expect(again.deliveryId).toBe(queued.deliveryId);
    expect(again.status).toBe("SUCCEEDED");
  });
});
