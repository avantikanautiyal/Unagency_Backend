import {
  setupEnterpriseApi,
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { API_ROUTE_MAP } from "../../../src/platform/api/routes/route-map";

const EI_SUFFIXES = [
  "model-decision",
  "routing",
  "planning",
  "timeline",
  "provider",
  "metrics",
  "tokens",
  "cost-breakdown",
  "quality",
  "confidence",
  "audit",
  "decision-graph",
] as const;

describe("Execution Intelligence Gateway APIs", () => {
  async function createExecution() {
    const platform = setupEnterpriseApi();
    const { token, organizationId } = await loginDemo(platform);
    const created = await platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "SECRET_PROMPT_MUST_NOT_LEAK",
          organizationId,
          workspaceId: platform.seed!.workspaceId,
          capabilityId: "marketing.social.carousel",
          metadata: {
            intent: "Marketing Campaign",
            brandBrain: { version: 12 },
            knowledge: { version: 8 },
            apiKey: "sk-secret-must-not-leak",
            prompt: "also-secret",
          },
        },
      })
    );
    expect(created.ok && created.value.status).toBeLessThan(400);
    if (!created.ok) throw new Error("create failed");
    const executionId = (created.value.body as { data: { executionId: string } }).data
      .executionId;
    return { platform, token, organizationId, executionId };
  }

  it("registers all execution-intelligence routes on v1 and v2", () => {
    for (const suffix of EI_SUFFIXES) {
      expect(
        API_ROUTE_MAP.some((r) => r.path === `/v1/executions/:executionId/${suffix}`)
      ).toBe(true);
      expect(
        API_ROUTE_MAP.some((r) => r.path === `/v2/executions/:executionId/${suffix}`)
      ).toBe(true);
    }
  });

  it("exposes model decision, routing, planning, timeline, provider, metrics", async () => {
    const { platform, token, executionId } = await createExecution();
    const auth = { authorization: `Bearer ${token}` };

    const model = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/model-decision`,
        headers: auth,
      })
    );
    expect(model.ok && model.value.status).toBe(200);
    if (!model.ok) return;
    const md = (model.value.body as { data: Record<string, unknown> }).data;
    expect(md.executionId).toBe(executionId);
    expect(md.resolvedModelId).toBeTruthy();
    expect(Array.isArray(md.candidateModels)).toBe(true);
    expect(md.reasonSelected).toBeTruthy();

    const routing = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/routing`,
        headers: auth,
      })
    );
    expect(routing.ok && routing.value.status).toBe(200);
    if (!routing.ok) return;
    const rd = (routing.value.body as { data: Record<string, unknown> }).data;
    expect(rd.routingStrategy).toBeTruthy();
    expect(Array.isArray(rd.fallbackChain)).toBe(true);

    const planning = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/planning`,
        headers: auth,
      })
    );
    expect(planning.ok && planning.value.status).toBe(200);

    const timeline = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/timeline`,
        headers: auth,
      })
    );
    expect(timeline.ok && timeline.value.status).toBe(200);
    if (!timeline.ok) return;
    const events = (timeline.value.body as { data: { events: { name: string }[] } }).data
      .events;
    expect(events.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        "brand_brain_retrieval",
        "knowledge_retrieval",
        "routing",
        "evaluation",
        "completed",
      ])
    );
  });

  it("exposes tokens, cost-breakdown, quality, confidence, audit, decision-graph", async () => {
    const { platform, token, executionId } = await createExecution();
    const auth = { authorization: `Bearer ${token}` };

    for (const suffix of [
      "tokens",
      "cost-breakdown",
      "quality",
      "confidence",
      "audit",
      "decision-graph",
      "provider",
      "metrics",
    ] as const) {
      const res = await platform.gateway.handle(
        apiRequest({
          method: "GET",
          path: `/v1/executions/${executionId}/${suffix}`,
          headers: auth,
        })
      );
      expect(res.ok && res.value.status).toBe(200);
    }

    const graph = await platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: `/v1/executions/${executionId}/decision-graph`,
        headers: auth,
      })
    );
    if (!graph.ok) return;
    const g = (graph.value.body as { data: Record<string, unknown> }).data;
    expect(g.intent).toBe("Marketing Campaign");
    expect((g.brandBrain as { version: number }).version).toBe(12);
    expect((g.knowledge as { version: number }).version).toBe(8);
    expect((g.selected as { model: string }).model).toBeTruthy();
    expect(Array.isArray(g.candidateModels)).toBe(true);
  });

  it("never exposes prompts or secrets in intelligence payloads", async () => {
    const { platform, token, executionId } = await createExecution();
    const auth = { authorization: `Bearer ${token}` };
    for (const suffix of EI_SUFFIXES) {
      const res = await platform.gateway.handle(
        apiRequest({
          method: "GET",
          path: `/v1/executions/${executionId}/${suffix}`,
          headers: auth,
        })
      );
      expect(res.ok && res.value.status).toBe(200);
      if (!res.ok) return;
      const raw = JSON.stringify(res.value.body);
      expect(raw).not.toContain("SECRET_PROMPT_MUST_NOT_LEAK");
      expect(raw).not.toContain("sk-secret-must-not-leak");
      expect(raw.toLowerCase()).not.toContain('"prompt"');
      expect(raw.toLowerCase()).not.toContain("apikey");
    }
  });
});
