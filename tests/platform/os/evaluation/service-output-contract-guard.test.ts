import { SpecGuardEvaluator } from "../../../../src/platform/os/evaluation/evaluators/spec-guard";
import {
  SERVICE_OUTPUT_MAP,
  validateServiceOutputContractInvariants,
} from "../../../../src/platform/config/service-output-map";

describe("service-output contract invariants (backend map)", () => {
  it("validates every SERVICE_OUTPUT_MAP entry", () => {
    for (const [key, spec] of Object.entries(SERVICE_OUTPUT_MAP)) {
      const violations = validateServiceOutputContractInvariants(spec);
      expect({ key, violations }).toEqual({ key, violations: [] });
    }
  });
});

describe("SpecGuard primary-vs-mockup metadata checks", () => {
  const guard = new SpecGuardEvaluator();

  const base = {
    organizationId: "org_1",
    executionId: "exec_1",
    planId: "plan_1",
    planVersion: 1,
    outputContractId: "image.generate",
    preview: "Generated creative output with enough text for preview checks.",
  };

  it("flags mockup kind when mockupRole is optional", () => {
    const result = guard.evaluate({
      ...base,
      outputKind: "image_mockup",
      mockupRole: "optional",
    });
    expect(result.outcome).toBe("RETRY_REQUIRED");
    expect(
      result.findings.some((f) => f.code === "SPEC_PRIMARY_REPLACED_BY_MOCKUP")
    ).toBe(true);
  });

  it("passes consistent production-asset contract metadata", () => {
    const result = guard.evaluate({
      ...base,
      outputKind: "image",
      mockupRole: "optional",
      expectedModalities: ["image"],
      actualModality: "image",
      expectedAspectRatio: "1:1",
      actualAspectRatio: "1:1",
    });
    expect(result.outcome).toBe("PASS");
  });

  it("warns on aspect-ratio mismatch when both values are provided", () => {
    const result = guard.evaluate({
      ...base,
      outputKind: "image",
      mockupRole: "prohibited",
      expectedAspectRatio: "1:1",
      actualAspectRatio: "9:16",
    });
    expect(result.outcome).toBe("PASS_WITH_WARNINGS");
    expect(
      result.findings.some((f) => f.code === "SPEC_ASPECT_RATIO_MISMATCH")
    ).toBe(true);
  });
});
