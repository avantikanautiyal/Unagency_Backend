import { readInheritedExecutionSpec } from "../../../src/platform/collaboration/conversational-task-intelligence/execution-spec-handoff";

const parentSpec = { executionInstruction: "This stage only: 3D Direction" };

function hostWithParent(parentMeta: Record<string, unknown>) {
  return {
    loadExecution: async () => undefined,
    loadExecutionCreateMetadata: async () => ({
      ...parentMeta,
      executionSpecSnapshot: { executionId: "exec_parent", spec: parentSpec },
    }),
  };
}

describe("readInheritedExecutionSpec — CDF stage boundaries", () => {
  it("does not inherit the previous stage's spec into the next stage", async () => {
    const spec = await readInheritedExecutionSpec({
      host: hostWithParent({ cdfPhaseId: "3d-direction" }),
      metadata: { parentExecutionId: "exec_parent", cdfPhaseId: "complete-pack" },
    });
    expect(spec).toBeUndefined();
  });

  it("still inherits for a refine of the same stage", async () => {
    const spec = await readInheritedExecutionSpec({
      host: hostWithParent({ cdfPhaseId: "3d-direction" }),
      metadata: { parentExecutionId: "exec_parent", cdfPhaseId: "3d-direction" },
    });
    expect(spec?.executionInstruction).toBe(parentSpec.executionInstruction);
  });

  it("still inherits outside staged services", async () => {
    const spec = await readInheritedExecutionSpec({
      host: hostWithParent({}),
      metadata: { parentExecutionId: "exec_parent" },
    });
    expect(spec?.executionInstruction).toBe(parentSpec.executionInstruction);
  });
});
