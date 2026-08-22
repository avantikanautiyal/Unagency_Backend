/**
 * Phase 9 — authenticated client journey through Gateway OS APIs.
 * In-memory Gateway tests — not live Mongo/Redis certification.
 */

import { MAX_REFINEMENT_QUESTIONS } from "../../../src/platform/os";
import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { matchRoute } from "../../../src/platform/api/routes/route-map";
import { getValidationSuite } from "../../../src/platform/validation/suites/validation-suites";
import { getValidationScenario } from "../../../src/platform/validation/scenarios/end-to-end-scenarios";

function unwrapData<T>(body: unknown): T {
  const b = body as { data?: T };
  return (b.data ?? body) as T;
}

describe("Phase 9 — M9 client journey", () => {
  it("registers phase9_client_experience suite", () => {
    const suite = getValidationSuite("phase9_client_experience");
    expect(suite?.scenarioIds).toContain("phase9_client_experience");
    const scenario = getValidationScenario("phase9_client_experience");
    expect(scenario?.stages).toContain("client_authentication");
    expect(scenario?.stages).toContain("adaptive_mcq");
    expect(matchRoute("GET", "/v1/os/executions/e1/plan")?.route.authRequired).toBe(
      true
    );
  });

  it("rejects unauthenticated clients (401)", async () => {
    const platform = setupEnterpriseApi();
    const denied = await platform.gateway.handle(
      apiRequest({ method: "POST", path: "/v1/os/refinements", body: {} })
    );
    expect(denied.ok && denied.value.status).toBe(401);
  });

  it("walks execution → refinement MCQ ≤5 → artifact → delivery as a client", async () => {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const auth = { authorization: `Bearer ${token}` };

    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: auth,
        body: {
          prompt: "Write a caption for my product launch.",
          organizationId,
          workspaceId: platform.seed!.workspaceId,
          capabilityId: "text.generate",
        },
      })
    );
    expect(created.ok && created.value.status < 400).toBe(true);
    const executionId = unwrapData<{ executionId: string }>(
      created.ok ? created.value.body : {}
    ).executionId;
    expect(executionId).toBeTruthy();

    const listed = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/executions",
        headers: auth,
        query: { limit: "20" },
      })
    );
    expect(listed.ok && listed.value.status).toBe(200);

    const plan = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/executions/${executionId}/plan`,
        headers: auth,
      })
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect([200, 404]).toContain(plan.value.status);
    }

    const graph = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/executions/${executionId}/task-graph`,
        headers: auth,
      })
    );
    expect(graph.ok).toBe(true);
    if (graph.ok) {
      expect([200, 404]).toContain(graph.value.status);
    }

    const evaluation = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/evaluation`,
        headers: auth,
      })
    );
    expect(evaluation.ok).toBe(true);

    const pendingReview = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/executions/${executionId}/review`,
        headers: auth,
      })
    );
    expect(pendingReview.ok).toBe(true);

    const refinement = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/refinements",
        headers: { ...auth, "idempotency-key": "p9-ref-1" },
        body: {
          executionId,
          sourceOutputId: "out_p9",
          sourceVersion: 1,
          sourcePreview: "draft caption",
          mode: "AI",
          outputType: "caption",
          sourceApprovalStatus: "APPROVED",
        },
      })
    );
    expect(refinement.ok && refinement.value.status).toBe(201);
    const session = unwrapData<{
      refinementId: string;
      question: {
        question: { questionId: string; options: { optionId: string }[] };
        questionNumber: number;
        maxQuestions: number;
      };
    }>(refinement.ok ? refinement.value.body : {});
    expect(session.refinementId).toBeTruthy();
    expect(session.question.maxQuestions).toBe(MAX_REFINEMENT_QUESTIONS);
    expect(session.question.questionNumber).toBe(1);

    let questions = 1;
    let current = session.question;
    while (current && questions <= MAX_REFINEMENT_QUESTIONS) {
      const answered = await platform.gateway.handle(
        apiRequest({
          method: "POST",
          path: `/v1/os/refinements/${session.refinementId}/answers`,
          headers: { ...auth, "idempotency-key": `p9-ans-${questions}` },
          body: {
            questionId: current.question.questionId,
            optionIds: [current.question.options[0]!.optionId],
          },
        })
      );
      expect(answered.ok && answered.value.status < 400).toBe(true);
      const body = unwrapData<{
        completed?: boolean;
        question: typeof current | null;
      }>(answered.ok ? answered.value.body : {});
      if (body.completed || !body.question) break;
      current = body.question;
      questions += 1;
    }
    expect(questions).toBeLessThanOrEqual(MAX_REFINEMENT_QUESTIONS);

    const q6 = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/refinements/${session.refinementId}/question`,
        headers: auth,
      })
    );
    expect(q6.ok && q6.value.status).toBe(200);
    const qBody = unwrapData<{ complete?: boolean; question: unknown }>(
      q6.ok ? q6.value.body : {}
    );
    if (qBody.question && typeof qBody.question === "object") {
      const presented = qBody.question as { questionNumber?: number };
      if (typeof presented.questionNumber === "number") {
        expect(presented.questionNumber).toBeLessThanOrEqual(MAX_REFINEMENT_QUESTIONS);
      }
    }

    await platform.executions.getDeliveryService().getArtifactStore().createVersion({
      artifactId: "art_p9",
      organizationId,
      executionId,
      preview: "approved caption",
      approvalState: "APPROVED",
      approvalReference: "apr_p9",
    });

    const versions = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/os/artifacts/art_p9/versions",
        headers: auth,
      })
    );
    expect(versions.ok && versions.value.status).toBe(200);
    const versionList = unwrapData<{ version: number }[]>(
      versions.ok ? versions.value.body : {}
    );
    expect(Array.isArray(versionList) && versionList.length).toBeGreaterThan(0);

    const authz = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/deliveries/authorize",
        headers: auth,
        body: {
          artifactId: "art_p9",
          artifactVersion: 1,
          executionId,
          destination: "export",
        },
      })
    );
    expect(authz.ok && authz.value.status).toBe(201);
    const authBody = unwrapData<{ authorized: boolean }>(
      authz.ok ? authz.value.body : {}
    );
    expect(authBody.authorized).toBe(true);

    const delivery = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/os/deliveries",
        headers: { ...auth, "idempotency-key": "p9-del-1" },
        body: {
          artifactId: "art_p9",
          artifactVersion: 1,
          executionId,
          destination: "export",
        },
      })
    );
    expect(delivery.ok && delivery.value.status).toBe(201);
    const receipt = unwrapData<{ deliveryId: string; status: string; artifactVersion: number }>(
      delivery.ok ? delivery.value.body : {}
    );
    expect(receipt.artifactVersion).toBe(1);
    expect(["QUEUED", "SUCCEEDED", "AUTHORIZED"]).toContain(receipt.status);

    const got = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/os/deliveries/${receipt.deliveryId}`,
        headers: auth,
      })
    );
    expect(got.ok && got.value.status).toBe(200);

    const other = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/os/artifacts/art_p9",
        headers: { authorization: "Bearer not-a-token" },
      })
    );
    expect(other.ok && other.value.status).toBe(401);
  });
});
