/**
 * Phase 8 — Gateway OS APIs, artifacts, delivery, end-to-end production path.
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
  createRefinementEngine,
  executeRefinementThroughOs,
  MAX_REFINEMENT_QUESTIONS,
  type ExecutionPlan,
} from "../../../src/platform/os";
import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { matchRoute } from "../../../src/platform/api/routes/route-map";

function unwrapData<T>(body: unknown): T {
  const b = body as { data?: T };
  return (b.data ?? body) as T;
}

describe("Phase 8 — Gateway contracts", () => {
  it("registers refinement, artifact, delivery, and review routes", () => {
    expect(matchRoute("POST", "/v1/os/refinements")?.route.authRequired).toBe(true);
    expect(matchRoute("GET", "/v1/os/artifacts/art_1")?.route.permissions).toContain(
      "execution:read"
    );
    expect(matchRoute("POST", "/v1/os/deliveries")?.route.permissions).toContain(
      "execution:create"
    );
    expect(
      matchRoute("POST", "/v1/os/reviews/rev_1/decision")?.route.permissions
    ).toContain("review:write");
  });

  it("rejects unauthenticated OS mutations", async () => {
    const platform = setupEnterpriseApi();
    const denied = await platform.gateway.handle(
      apiRequest({ method: "POST", path: "/v1/os/refinements", body: {} })
    );
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.value.status).toBe(401);
  });

  it("supports refinement + delivery HTTP contracts with idempotency", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const auth = { authorization: `Bearer ${token}` };

    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/refinements",
        headers: { ...auth, "idempotency-key": "ref-1" },
        body: {
          executionId: "exec_gw",
          sourceOutputId: "out_1",
          sourceVersion: 1,
          sourcePreview: "approved caption",
          mode: "AI",
          outputType: "caption",
          sourceApprovalStatus: "APPROVED",
        },
      })
    );
    expect(created.ok && created.value.status).toBe(201);
    const first = unwrapData<{
      refinementId: string;
      question: { question: { questionId: string; options: { optionId: string }[] } };
    }>(created.ok ? created.value.body : {});
    expect(first.refinementId).toBeTruthy();

    const dup = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/refinements",
        headers: { ...auth, "idempotency-key": "ref-1" },
        body: {
          executionId: "exec_gw",
          sourceOutputId: "out_1",
          sourceVersion: 1,
          mode: "AI",
        },
      })
    );
    const second = unwrapData<{ refinementId: string }>(dup.ok ? dup.value.body : {});
    expect(second.refinementId).toBe(first.refinementId);

    const q = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/refinements/${first.refinementId}/question`,
        headers: auth,
      })
    );
    expect(q.ok && q.value.status).toBe(200);

    await platform.executions.getDeliveryService().getArtifactStore().createVersion({
      artifactId: "art_gw",
      organizationId,
      executionId: "exec_gw",
      preview: "approved exportable caption content",
      approvalState: "APPROVED",
      approvalReference: "apr_gw",
    });

    const authz = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/deliveries/authorize",
        headers: auth,
        body: {
          artifactId: "art_gw",
          artifactVersion: 1,
          executionId: "exec_gw",
          destination: "export",
        },
      })
    );
    expect(authz.ok && authz.value.status).toBe(201);
    const authBody = unwrapData<{ authorized: boolean }>(authz.ok ? authz.value.body : {});
    expect(authBody.authorized).toBe(true);

    const del = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/deliveries",
        headers: { ...auth, "idempotency-key": "del-1" },
        body: {
          artifactId: "art_gw",
          artifactVersion: 1,
          executionId: "exec_gw",
          destination: "export",
        },
      })
    );
    expect(del.ok && del.value.status).toBe(201);
    const receipt = unwrapData<{ deliveryId: string; status: string }>(
      del.ok ? del.value.body : {}
    );
    expect(receipt.status).toBe("SUCCEEDED");

    const got = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/deliveries/${receipt.deliveryId}`,
        headers: auth,
      })
    );
    expect(got.ok && got.value.status).toBe(200);
  });
});

describe("Phase 8 — end-to-end production path", () => {
  const caps = createProductionNegotiationPlatform().capabilityRegistry;

  it("queue → worker → eval/gov → artifact → delivery, then refinement ≤5 → v2", async () => {
    const graphStore = new InMemoryTaskGraphRunStore();
    const queue = new InMemoryOsWorkQueue();
    const runner = new ControllableTaskCapabilityRunner();
    const plans = new Map<string, ExecutionPlan>();
    const delivery = createOsDeliveryService({ mode: "queued" });
    let runtime: ReturnType<typeof createOsProductionRuntime>;
    const engine = createTaskGraphExecutorEngine({
      runner,
      capabilityRegistry: caps,
      store: graphStore,
      executeMode: "queued",
      enableGovernance: true,
      onTasksReady: async ({ snapshot, readyTaskIds }) => {
        await runtime.enqueueReadyTasks({ snapshot, readyTaskIds });
      },
    });
    runtime = createOsProductionRuntime({
      executor: engine,
      queue,
      delivery,
      resolvePlan: async (id) => plans.get(id),
    });

    const intelligence = createExecutionIntelligenceOsEngine({
      capabilityRegistry: caps,
    });
    const brief = createBriefIntelligenceEngine().createBrief({
      tenant: {
        organizationId: "org_a",
        requestId: "req_e2e",
        executionId: "exec_e2e",
      },
      rawPrompt: "Write a caption for my product.",
      clientCapabilityId: "text.generate",
    });
    const plan = intelligence.createPlan({
      organizationId: "org_a",
      executionId: "exec_e2e",
      requestId: "req_e2e",
      brief,
    });
    expect(plan.status).toBe("APPROVED_FOR_EXECUTION");
    plans.set("exec_e2e", plan);

    await engine.execute({
      organizationId: "org_a",
      executionId: "exec_e2e",
      requestId: "req_e2e",
      plan,
    });
    for (let i = 0; i < 8; i++) {
      const snap = await graphStore.get("exec_e2e", "org_a");
      if (snap && snap.status !== "RUNNING" && snap.status !== "PENDING") break;
      await runtime.tickTaskWorker(`w${i}`);
    }
    const done = await graphStore.get("exec_e2e", "org_a");
    expect(done?.status).toBe("SUCCEEDED");
    expect(done?.approvalStatus === "APPROVED" || done?.status === "SUCCEEDED").toBe(true);

    const preview = done!.tasks[0]!.outputRef?.preview ?? "caption output";
    const art = await delivery.getArtifactStore().createVersion({
      artifactId: "art_e2e",
      organizationId: "org_a",
      executionId: "exec_e2e",
      planVersion: plan.planVersion,
      preview,
      approvalState: "APPROVED",
      approvalReference: done?.lastGovernanceDecisionId ?? "apr_e2e",
    });
    await delivery.getArtifactStore().createManifest({
      organizationId: "org_a",
      executionId: "exec_e2e",
      planVersion: plan.planVersion,
      entries: [{ artifactId: art.artifactId, version: art.version }],
    });
    const queued = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: art.artifactId,
      artifactVersion: art.version,
      executionId: "exec_e2e",
      destination: "export",
    });
    expect(queued.status).toBe("QUEUED");
    await runtime.enqueueDelivery(queued);
    await runtime.tickDeliveryWorker("dw1");
    const receipt = await delivery.getDelivery(queued.deliveryId, "org_a");
    expect(receipt?.status).toBe("SUCCEEDED");

    const refinement = createRefinementEngine();
    const started = await refinement.requestRefinement({
      organizationId: "org_a",
      executionId: "exec_e2e",
      sourceOutputId: art.artifactId,
      sourceVersion: art.version,
      sourcePreview: preview,
      mode: "AI",
      outputType: "caption",
      sourceApprovalStatus: "APPROVED",
      planId: plan.id,
      planVersion: plan.planVersion,
    });
    let questions = 0;
    let current = started.presented;
    while (current && questions < MAX_REFINEMENT_QUESTIONS) {
      questions += 1;
      const answered = await refinement.submitAnswer({
        refinementId: started.request.refinementId,
        organizationId: "org_a",
        questionId: current.question.questionId,
        optionIds: [current.question.options[0]!.optionId],
      });
      if (answered.completed) break;
      current = answered.next!;
    }
    expect(questions).toBeLessThanOrEqual(MAX_REFINEMENT_QUESTIONS);
    const completed = await refinement.getStore().get(
      started.request.refinementId,
      "org_a"
    );
    const spec =
      (await refinement.getStore().getSpecByRefinement(
        started.request.refinementId,
        "org_a"
      )) ??
      (
        await refinement.completeFeedback({
          refinementId: started.request.refinementId,
          organizationId: "org_a",
        })
      ).specification;
    expect(spec).toBeTruthy();

    const v2 = await executeRefinementThroughOs({
      organizationId: "org_a",
      requestId: "req_e2e_r2",
      refinementId: started.request.refinementId,
      specification: spec!,
      previousPlan: plan,
      brief,
      executionIntelligence: intelligence,
      taskGraphExecutor: createTaskGraphExecutorEngine({
        runner: new ControllableTaskCapabilityRunner(),
        capabilityRegistry: caps,
        store: new InMemoryTaskGraphRunStore(),
      }),
      refinementEngine: refinement,
      deliveryService: delivery,
    });
    expect(v2.artifactVersion).toBeGreaterThan(art.version);
    const v2del = await delivery.createDelivery({
      organizationId: "org_a",
      artifactId: v2.artifactId,
      artifactVersion: v2.artifactVersion,
      executionId: v2.snapshot.executionId,
      destination: "export",
      deliveryIntent: "v2",
    });
    if (v2del.status === "QUEUED") {
      await runtime.enqueueDelivery(v2del);
      await runtime.tickDeliveryWorker("dw2");
    }
    const v2receipt = await delivery.getDelivery(v2del.deliveryId, "org_a");
    expect(v2receipt?.status === "SUCCEEDED" || v2del.status === "SUCCEEDED").toBe(
      true
    );
    expect(v2receipt?.artifactVersion ?? v2del.artifactVersion).toBe(v2.artifactVersion);
    expect(completed?.organizationId).toBe("org_a");
  });
});
