/**
 * Thin OS path — skip pain layers on product / enhance creates.
 * Task Intelligence plan is opt-in for multi-deliverable only.
 */

import {
  applyThinOsPathMetadata,
  buildThinTaskGraphLeafMetadata,
  shouldEnableExecutionPlan,
  shouldSkipPromptCompiler,
} from "../../../src/platform/api/services/execution-thin-path";

describe("execution thin path", () => {
  it("skips Brief/Brand/Knowledge/Plan for enhance_prompt", () => {
    const meta = applyThinOsPathMetadata({
      productAction: "enhance_prompt",
      service: "presentations",
    });
    expect(meta.thinOsPath).toBe(true);
    expect(meta.skipBriefIntelligence).toBe(true);
    expect(meta.skipBrandKnowledge).toBe(true);
    expect(meta.skipExecutionIntelligence).toBe(true);
    expect(meta.skipPromptCompiler).toBe(true);
  });

  it("skips Plan for create_design but keeps Brief/Brand available", () => {
    const meta = applyThinOsPathMetadata({
      productAction: "create_design",
      service: "branding",
    });
    expect(meta.thinOsPath).toBeUndefined();
    expect(meta.skipBriefIntelligence).toBeUndefined();
    expect(meta.skipExecutionIntelligence).toBe(true);
    expect(meta.skipPlanning).toBe(true);
  });

  it("keeps Plan for bare enterprise creates without productAction", () => {
    const meta = applyThinOsPathMetadata({
      capabilityId: "text.generate",
    });
    expect(meta.skipExecutionIntelligence).toBeUndefined();
    expect(meta.skipPlanning).toBeUndefined();
  });

  it("enables Plan for compound / multi-deliverable product creates", () => {
    const meta = applyThinOsPathMetadata({
      productAction: "create_design",
      service: "social",
      serviceContextKind: "compound",
      multiDeliverable: true,
    });
    expect(meta.enableExecutionPlan).toBe(true);
    expect(meta.taskGraphRecommended).toBe(true);
    expect(meta.skipExecutionIntelligence).toBeUndefined();
    expect(meta.skipPlanning).toBeUndefined();
  });

  it("enables Plan when enableExecutionPlan is explicit", () => {
    const meta = applyThinOsPathMetadata({
      productAction: "create_design",
      enableExecutionPlan: true,
    });
    expect(meta.enableExecutionPlan).toBe(true);
    expect(meta.skipPlanning).toBeUndefined();
  });

  it("shouldEnableExecutionPlan from deliverable count", () => {
    expect(
      shouldEnableExecutionPlan({
        metadata: { productAction: "create_design" },
        deliverableCount: 1,
      })
    ).toBe(false);
    expect(
      shouldEnableExecutionPlan({
        metadata: { productAction: "create_design" },
        deliverableCount: 3,
      })
    ).toBe(true);
  });

  it("builds thin task-graph leaf metadata", () => {
    const leaf = buildThinTaskGraphLeafMetadata({
      capabilityId: "text.generate",
      brandId: "brand_1",
    });
    expect(leaf.productAction).toBe("task_graph_leaf");
    expect(leaf.thinOsPath).toBe(true);
    expect(leaf.taskGraphLeaf).toBe(true);
    expect(leaf.skipBriefIntelligence).toBe(true);
    expect(leaf.skipPromptCompiler).toBe(true);
    expect(leaf.brandId).toBe("brand_1");
  });

  it("applyThinOsPathMetadata treats task_graph_leaf as thin", () => {
    const meta = applyThinOsPathMetadata({
      productAction: "task_graph_leaf",
      service: "social",
    });
    expect(meta.thinOsPath).toBe(true);
    expect(meta.skipBriefIntelligence).toBe(true);
    expect(meta.skipExecutionIntelligence).toBe(true);
  });

  it("skips PromptCompiler when prompt already has OS blocks", () => {
    expect(
      shouldSkipPromptCompiler({
        rawPrompt:
          "Hello\n\n[Structured Brief — authoritative]\nintent=document",
      })
    ).toBe(true);
    expect(
      shouldSkipPromptCompiler({
        metadata: { skipPromptCompiler: true },
        rawPrompt: "plain brief",
      })
    ).toBe(true);
    expect(
      shouldSkipPromptCompiler({
        rawPrompt: "plain brief only",
      })
    ).toBe(false);
  });
});
