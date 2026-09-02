import { appendOutputRequirementsToPrompt } from "../../../src/platform/direct/append-output-requirements";

describe("appendOutputRequirementsToPrompt", () => {
  it("does not append mockup requirements for direct image route fan-out", () => {
    const prompt = "Create an Instagram post for DiVastra.";
    const out = appendOutputRequirementsToPrompt({
      prompt,
      metadata: {
        service: "social",
        subtype: "content-design",
        platform: "instagram",
        skipOutputRequirements: true,
        productAction: "route_visual",
        routeVisualSlot: 0,
      },
    });
    expect(out).toBe(prompt);
    expect(out).not.toContain("[Output requirements]");
  });

  it("appends HARD_CONSTRAINT block for route_visual when executionSpecSnapshot present", () => {
    const prompt = "Minimal logo wordmark for TerraLoop";
    const out = appendOutputRequirementsToPrompt({
      prompt,
      metadata: {
        service: "branding",
        subtype: "logos",
        skipOutputRequirements: true,
        productAction: "route_visual",
        routeVisualSlot: 0,
        executionSpecSnapshot: {
          snapshotId: "snap_test",
          executionId: "exec_test",
          snapshotAt: "2026-01-01T00:00:00.000Z",
          planeVersion: "p4.6.0",
          spec: {
            planeVersion: "p4.6.0",
            resolutionState: "RESOLVED",
            deliverables: [{ format: "PNG", required: true, editable: false }],
            outputIntent: { mode: { value: "ALTERNATIVES" } },
            content: {},
            technical: {},
            creative: {
              negativeConstraints: [
                {
                  value: {
                    subject: "leaf icons",
                    normalizedConcept: "leaf_icons",
                    enforcement: "HARD_CONSTRAINT",
                  },
                  provenance: { source: "EXPLICIT_USER", explicit: true },
                },
              ],
            },
            task: {},
            brandAssets: {},
            executionInstruction: "Create logo. HARD CONSTRAINT — Do NOT include leaf icons.",
          },
        },
      },
    });
    expect(out).toContain("[User requirements — negative constraints]");
    expect(out).toMatch(/HARD CONSTRAINT.*leaf/i);
    expect(out).not.toContain("[Output requirements]");
  });

  it("does not append requirements for visual direction planning step", () => {
    const prompt = "Create an Instagram post for DiVastra.";
    const out = appendOutputRequirementsToPrompt({
      prompt,
      metadata: {
        service: "social",
        subtype: "content-design",
        productAction: "visual_direction",
      },
    });
    expect(out).toBe(prompt);
  });

  it("appends production-asset requirements for social content-design (not mockup-primary)", () => {
    const prompt = "Create an Instagram post for DiVastra.";
    const out = appendOutputRequirementsToPrompt({
      prompt,
      metadata: {
        service: "social",
        subtype: "content-design",
        platform: "instagram",
        productAction: "direct_passthrough",
      },
    });
    expect(out).toContain("[Output requirements]");
    expect(out).toContain("Format: image");
    expect(out).toContain("Mockup role: optional");
    expect(out).toMatch(/production-ready deliverable/i);
    expect(out).not.toContain("Include a realistic mockup presentation.");
  });

  it("appends mockup-primary requirements for merchandise", () => {
    const prompt = "Design a T-shirt for DiVastra.";
    const out = appendOutputRequirementsToPrompt({
      prompt,
      metadata: {
        service: "merchandise",
        subtype: "t-shirts",
        productAction: "direct_passthrough",
      },
    });
    expect(out).toContain("Format: image_mockup");
    expect(out).toContain("Mockup role: primary");
    expect(out).toMatch(/mockup visualization/i);
  });

  it("only adds optional mockup instructions when the brief asks for a mockup", () => {
    const without = appendOutputRequirementsToPrompt({
      prompt: "Design a logo for DiVastra",
      metadata: {
        service: "branding",
        subtype: "logo-design",
        productAction: "direct_passthrough",
      },
    });
    expect(without).toContain("Format: image");
    expect(without).not.toMatch(/brief requests a mockup/i);

    const withMockup = appendOutputRequirementsToPrompt({
      prompt: "Design a logo for DiVastra and show it on a business card mockup",
      metadata: {
        service: "branding",
        subtype: "logo-design",
        productAction: "direct_passthrough",
      },
    });
    expect(withMockup).toMatch(/brief requests a mockup/i);
  });
});
