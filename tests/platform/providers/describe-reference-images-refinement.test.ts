import {
  describeReferenceImages,
  requestIsRefinement,
} from "../../../src/platform/providers/image/common/vendor-image-protocol";

const refs = [
  { base64: "x", relationshipLabel: "user_selected_generation_reference" },
] as never;

describe("describeReferenceImages on a refine", () => {
  it("lets the refine instruction override reproduce-exactly", () => {
    const text = describeReferenceImages(refs, {
      refinement: requestIsRefinement({ cdfRefineSource: true }),
    });
    expect(text).toContain("REFINEMENT");
    expect(text).not.toContain("Change only what this stage's deliverable requires");
  });

  it("keeps stage-handoff wording when not refining", () => {
    expect(requestIsRefinement({})).toBe(false);
    expect(describeReferenceImages(refs)).not.toContain("REFINEMENT");
  });
});
