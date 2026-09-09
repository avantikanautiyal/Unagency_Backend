import {
  defaultDeliverablesForService,
  resolveDeliverables,
  serviceSupportsDeliverable,
} from "../../../src/platform/collaboration/conversational-task-intelligence/deliverable-resolver";
import { resolveServiceOutputSpec } from "../../../src/platform/config/service-output-map";

describe("deliverable-resolver format fidelity", () => {
  const packagingSpec = resolveServiceOutputSpec({
    service: "packaging",
    subtype: "gift-packs",
  });

  it("supports PDF export for print-ready image packaging", () => {
    expect(serviceSupportsDeliverable("PDF", packagingSpec)).toBe(true);
  });

  it("merges explicit PDF request with native PNG/JPG defaults", () => {
    const defaults = defaultDeliverablesForService(packagingSpec);
    const result = resolveDeliverables({
      requested: ["PDF"],
      serviceDefaultFormats: defaults,
      serviceSpec: packagingSpec,
      explicitOnly: true,
      mergeServiceDefaults: true,
    });
    expect(result.resolutionState).toBe("RESOLVED");
    expect(result.deliverables.map((d) => d.format)).toEqual(
      expect.arrayContaining(["PDF", "PNG", "JPG"]),
    );
    expect(result.deliverables.find((d) => d.format === "PDF")?.provenance.explicit).toBe(
      true,
    );
    expect(result.deliverables.find((d) => d.format === "PNG")?.provenance.explicit).toBe(
      false,
    );
  });

  it("still blocks when every explicit format is unsupported for the service", () => {
    const socialSpec = resolveServiceOutputSpec({
      service: "social",
      subtype: "posts",
    });
    const result = resolveDeliverables({
      requested: ["MP4"],
      serviceDefaultFormats: defaultDeliverablesForService(socialSpec),
      serviceSpec: socialSpec,
      explicitOnly: true,
      mergeServiceDefaults: true,
    });
    expect(result.resolutionState).toBe("UNSUPPORTED_DELIVERABLE");
    expect(result.unsupported).toContain("MP4");
  });
});
