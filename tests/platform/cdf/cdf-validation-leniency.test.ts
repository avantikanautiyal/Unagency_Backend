import {
  applyRequirementCheckLeniency,
  qualityAttemptFromMetadata,
} from "../../../src/platform/cdf/generation-validation/leniency";
import { aggregateValidationStatus } from "../../../src/platform/cdf/generation-validation/policy";
import type { CdfValidationCheck } from "../../../src/platform/cdf/generation-validation/types";

function check(
  requirementKey: string,
  overrides: Partial<CdfValidationCheck> = {},
): CdfValidationCheck {
  return {
    checkId: `chk_${requirementKey}`,
    requirementKey,
    category: "test",
    verificationType: "exact_match",
    capability: "machine_verifiable",
    fieldPath: requirementKey,
    expected: "x",
    actual: null,
    status: "fail",
    severity: "blocking",
    evidence: `${requirementKey} missing`,
    ...overrides,
  };
}

const status = (checks: CdfValidationCheck[], artifactKey: string, qualityAttempt?: number) =>
  aggregateValidationStatus(
    applyRequirementCheckLeniency(checks, { artifactKey, qualityAttempt }),
  );

describe("CDF validation leniency", () => {
  it("never blocks social-media creatives on unobservable requirements", () => {
    const checks = [
      check("required_logo"),
      check("exact_headline"),
      check("dimensions", { verificationType: "dimensions", status: "unable_to_verify" }),
    ];
    expect(status(checks, "social-media.creative-directions")).toBe("passed");
  });

  it("blocks logo / headline misses before the final attempt only", () => {
    expect(status([check("required_logo")], "presentation.deck")).toBe("failed");
    expect(status([check("exact_headline")], "presentation.deck", 2)).toBe("failed");
    // Final attempt is never blocked by a quality check — the user decides.
    expect(status([check("required_logo")], "presentation.deck", 3)).toBe("passed");
    expect(status([check("exact_headline")], "presentation.deck", 3)).toBe("passed");
  });

  it("blocks size / format before the final attempt, passes on attempt 3", () => {
    const dims = [check("dimensions", { verificationType: "dimensions" })];
    expect(status(dims, "presentation.deck", 1)).toBe("failed");
    expect(status(dims, "presentation.deck", 2)).toBe("failed");
    expect(status(dims, "presentation.deck", 3)).toBe("passed");
  });

  it("blocks an explicit slide count miss on presentations before the final attempt", () => {
    const count = [check("slide_count", { verificationType: "count" })];
    expect(status(count, "presentation.storyline", 1)).toBe("failed");
    expect(status(count, "presentation.deck", 2)).toBe("failed");
    expect(status(count, "presentation.deck", 3)).toBe("passed");
    expect(status(count, "social-media.creative-directions", 1)).toBe("passed");
  });

  it("downgrades minor requirements to warnings", () => {
    expect(
      status(
        [check("route_count", { verificationType: "count" }), check("brand_colors")],
        "presentation.deck",
      ),
    ).toBe("passed");
  });

  it("reads the attempt from execution metadata", () => {
    expect(qualityAttemptFromMetadata({ cdfQualityAttempt: 3 })).toBe(3);
    expect(qualityAttemptFromMetadata({})).toBe(1);
    expect(qualityAttemptFromMetadata(undefined)).toBe(1);
  });
});
