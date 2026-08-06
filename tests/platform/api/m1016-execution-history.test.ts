/**
 * M10.16 — execution history, soft delete, pin, duplicate (in-memory persistence).
 */

import {
  applyExecutionHistoryQuery,
} from "../../../src/platform/infrastructure/durability/repositories/execution-history-list";
import { InMemoryExecutionRepository } from "../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import type { ExecutionResource } from "../../../src/platform/api/contracts";
import {
  apiRequest,
  loginDemo,
} from "../../../src/platform/api/testing";
import { bootstrapEnterpriseApiRuntime, resetEnterpriseApiRuntimeForTests } from "../../../src/platform/api/runtime";

function sampleExecution(
  partial: Partial<ExecutionResource> & Pick<ExecutionResource, "executionId">
): ExecutionResource {
  const now = new Date().toISOString();
  return {
    executionId: partial.executionId,
    status: partial.status ?? "succeeded",
    organizationId: partial.organizationId ?? "org_demo",
    correlationId: partial.correlationId ?? "corr",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    promptPreview: partial.promptPreview ?? "Preview",
    ...partial,
  };
}

describe("M10.16 execution history query (in-memory)", () => {
  it("filters status, q, sort, and paginates", async () => {
    const repo = new InMemoryExecutionRepository();
    await repo.save(
      sampleExecution({
        executionId: "e1",
        organizationId: "org_a",
        status: "succeeded",
        promptPreview: "Alpha launch",
        createdAt: "2026-01-02T00:00:00.000Z",
      })
    );
    await repo.save(
      sampleExecution({
        executionId: "e2",
        organizationId: "org_a",
        status: "failed",
        promptPreview: "Beta fail",
        createdAt: "2026-01-03T00:00:00.000Z",
      })
    );

    const page = await repo.listByTenant("org_a", {
      status: "succeeded",
      q: "alpha",
      sort: "newest",
      limit: 10,
      page: 1,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.executionId).toBe("e1");

    const all = await repo.listByTenant("org_a", { limit: 100 });
    const oldest = applyExecutionHistoryQuery(all.items, "org_a", {
      sort: "oldest",
    });
    expect(oldest.items[0]?.executionId).toBe("e1");
  });

  it("excludes soft-deleted unless includeDeleted", async () => {
    const rows = [
      sampleExecution({ executionId: "e1", deletedAt: "2026-01-01T00:00:00.000Z" }),
      sampleExecution({ executionId: "e2" }),
    ];
    const hidden = applyExecutionHistoryQuery(rows, "org_demo", {});
    expect(hidden.items.map((i) => i.executionId)).toEqual(["e2"]);
    const shown = applyExecutionHistoryQuery(rows, "org_demo", { includeDeleted: true });
    expect(shown.items).toHaveLength(2);
  });
});

describe("M10.16 execution history API", () => {
  afterEach(() => {
    resetEnterpriseApiRuntimeForTests();
  });

  it("GET /v1/executions returns page envelope", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "History list test",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );

    const res = await runtime.platform.gateway.handle(
      apiRequest({
        method: "GET",
        path: "/v1/executions",
        query: { limit: "5", page: "1" },
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const body = res.value.body as {
      data: { items: unknown[]; page: number; limit: number; total: number };
    };
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.page).toBe(1);
    expect(typeof body.data.total).toBe("number");
  }, 120000);

  it("pin, soft delete, duplicate via POST actions", async () => {
    const runtime = bootstrapEnterpriseApiRuntime({
      executionMode: "simulated",
      seedDemoTenant: true,
    });
    const { token, organizationId } = await loginDemo(runtime.platform);
    const created = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: "/v1/executions",
        headers: { authorization: `Bearer ${token}` },
        body: {
          prompt: "Pin delete duplicate",
          capabilityId: "text.generate",
          organizationId,
        },
      })
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const execId = (created.value.body as { data: { executionId: string } }).data
      .executionId;

    const pin = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${execId}/pin`,
        headers: { authorization: `Bearer ${token}` },
        body: { pinned: true },
      })
    );
    expect(pin.ok).toBe(true);

    const dup = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${execId}/duplicate`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(dup.ok).toBe(true);

    const del = await runtime.platform.gateway.handle(
      apiRequest({
        method: "POST",
        path: `/v1/executions/${execId}/delete`,
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    const deleted = (del.value.body as { data: { deletedAt?: string } }).data;
    expect(deleted.deletedAt).toBeTruthy();
  }, 120000);
});
