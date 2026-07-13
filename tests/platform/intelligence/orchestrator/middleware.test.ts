import { MiddlewarePipeline } from "../../../../src/platform/intelligence/orchestrator/middleware/middleware-pipeline";
import { createLoggingMiddleware } from "../../../../src/platform/intelligence/orchestrator/middleware/placeholder-middleware";
import { success } from "../../../../src/platform/intelligence/shared/result";
import { samplePlan, sampleRuntimeContext } from "./helpers";

describe("MiddlewarePipeline", () => {
  it("invokes middleware around terminal handler", async () => {
    const pipeline = new MiddlewarePipeline();
    const order: string[] = [];

    pipeline.use({
      name: "a",
      kind: "custom",
      async invoke(_ctx, next) {
        order.push("a-before");
        const result = await next();
        order.push("a-after");
        return result;
      },
    });
    pipeline.use(createLoggingMiddleware());

    const result = await pipeline.execute(
      {
        orchestrationId: "o1",
        plan: samplePlan(),
        runtimeContext: sampleRuntimeContext(),
        startedAt: "2026-01-01T00:00:00.000Z",
      },
      async () => {
        order.push("terminal");
        return success({
          orchestrationId: "o1",
          planId: "plan_orch",
          status: "completed",
          contributions: [],
          aggregated: undefined,
          completedAt: "2026-01-01T00:00:00.000Z",
        });
      }
    );

    expect(result.ok).toBe(true);
    expect(order).toEqual(["a-before", "terminal", "a-after"]);
  });
});
