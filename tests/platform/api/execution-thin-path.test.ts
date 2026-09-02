/**
 * Direct provider passthrough metadata helpers.
 */

import { applyDirectPassthroughMetadata, sanitizeMediaGenerationCreateMetadata } from "../../../src/platform/api/services/execution-thin-path";

describe("execution thin path", () => {
  it("applyDirectPassthroughMetadata sets direct flags and strips enrichment", () => {
    const meta = applyDirectPassthroughMetadata({
      productAction: "enhance_prompt",
      service: "presentations",
      enrichedPrompt: "wrapped prompt",
    });
    expect(meta.directPassthrough).toBe(true);
    expect(meta.directProvider).toBe(true);
    expect(meta.thinOsPath).toBe(true);
    expect(meta.enrichedPrompt).toBeUndefined();
    expect(meta.enableExecutionPlan).toBeUndefined();
    expect(meta.taskGraphRecommended).toBeUndefined();
  });

  it("defaults productAction to direct_passthrough when missing", () => {
    const meta = applyDirectPassthroughMetadata({ brandId: "brand_1" });
    expect(meta.productAction).toBe("direct_passthrough");
    expect(meta.brandId).toBe("brand_1");
  });

  it("strips structured output from image.generate creates", () => {
    const sanitized = sanitizeMediaGenerationCreateMetadata({
      capabilityId: "image.generate",
      structuredOutput: {
        name: "PresentationRouteConcepts",
        schema: { type: "object" },
        strict: true,
      },
      metadata: {
        service: "ads",
        subtype: "performance-ads",
        outputKind: "presentation",
        productAction: "route_visual",
        presentationExpandMode: "full",
        deliverableRequired: true,
      },
    });
    expect(sanitized.structuredOutput).toBeUndefined();
    expect(sanitized.metadata.structuredOutput).toBeUndefined();
    expect(sanitized.metadata.outputKind).toBe("image");
    expect(sanitized.metadata.presentationExpandMode).toBeUndefined();
    expect(sanitized.metadata.deliverableRequired).toBeUndefined();
  });
});
