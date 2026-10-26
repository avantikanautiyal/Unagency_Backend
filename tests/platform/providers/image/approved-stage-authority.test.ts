import {
  describeReferenceImages,
  requestIsOneOfSeveralOptions,
} from "../../../../src/platform/providers/image/common/vendor-image-protocol";

const approved3d = {
  base64: "x",
  mimeType: "image/png",
  relationshipLabel: "cdf_upstream_visual_artifact",
  upstreamPhaseId: "3d-direction",
} as never;
const logo = { base64: "y", mimeType: "image/png", semanticReferenceRole: "identity_mark" } as never;

describe("approved upstream stages are the design authority", () => {
  it("a single follow-on stage must reproduce the approved design exactly", () => {
    const text = describeReferenceImages([approved3d, logo]);
    expect(text).toContain("DESIGN AUTHORITY: Image 1 is the approved design. Reproduce it exactly");
    expect(text).toContain("follow the images");
    expect(text).toContain("Do not redesign");
    expect(text).not.toMatch(/explore different directions/);
  });

  it("an option set may vary presentation only, never artwork or copy", () => {
    const text = describeReferenceImages([approved3d], { oneOfSeveralOptions: true });
    expect(text).toContain("vary only the presentation");
    expect(text).toContain("never the approved artwork, copy or colours");
  });

  it("only fanout / multi-option requests count as options — never document pages", () => {
    expect(requestIsOneOfSeveralOptions({ generationFanoutTargetId: "fanout_0_luma" })).toBe(true);
    expect(requestIsOneOfSeveralOptions({ creativeOptionCount: 3 })).toBe(true);
    expect(requestIsOneOfSeveralOptions({ creativeOptionCount: 4, cdfPageDocumentPart: true })).toBe(false);
    expect(requestIsOneOfSeveralOptions({ creativeOptionCount: 1 })).toBe(false);
    expect(requestIsOneOfSeveralOptions(undefined)).toBe(false);
  });

  it("no upstream stage attached → no authority block", () => {
    expect(describeReferenceImages([logo])).toBe("");
  });
});
