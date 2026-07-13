import {
  stageOrder,
  validateExecutionGraph,
  validateExecutionPlan,
} from "../../../../src/platform/intelligence/execution-planning/engine/graph-validation";
import { createPlanningFixture, sampleRequest } from "./helpers";

describe("Execution graph", () => {
  it("validates graph integrity", async () => {
    const { engine } = createPlanningFixture();
    const plan = await engine.produceExecutionPlan(sampleRequest());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const graphResult = validateExecutionGraph(plan.value.graph);
    expect(graphResult.ok).toBe(true);

    const planResult = validateExecutionPlan(plan.value);
    expect(planResult.ok).toBe(true);
  });

  it("orders stages ascending", async () => {
    const { engine } = createPlanningFixture({ humanReview: true });
    const plan = await engine.produceExecutionPlan(sampleRequest());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const orders = plan.value.graph.stages.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(stageOrder(plan.value)[0]).toBe("stage_main");
  });

  it("rejects broken graphs", () => {
    const result = validateExecutionGraph({
      entryNodeId: "a",
      exitNodeId: "missing",
      nodes: [{ id: "a", kind: "capability", label: "a", stageId: "s", order: 0 }],
      edges: [],
      stages: [{ id: "s", name: "s", mode: "sequential", order: 0, nodeIds: ["a"] }],
    });
    expect(result.ok).toBe(false);
  });
});
