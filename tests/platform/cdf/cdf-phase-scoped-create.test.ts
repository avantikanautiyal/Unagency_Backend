/**
 * CDF early-phase create stamps must not force full structured schemas.
 */

import { shouldOmitCdfStructuredStamp } from "../../../src/platform/cdf/phase-scoped-create";
import { stampPresentationCreateMetadata } from "../../../src/platform/direct/presentation-direct-metadata";
import { stampEmailCreateMetadata } from "../../../src/platform/direct/email-direct-metadata";

describe("CDF phase-scoped create stamps", () => {
  it("skips PresentationRouteConcepts for early storyline phase", () => {
    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      cdfPhaseId: "storyline",
      cdfOmitStructuredOutput: true,
      presentationExpandMode: "lazy",
    });
    expect(stamped.structuredOutput).toBeUndefined();
    expect(stamped.presentationExpandMode).toBe("lazy");
  });

  it("still stamps full deck for late full-deck phase", () => {
    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      cdfPhaseId: "full-deck",
      presentationExpandMode: "full",
    });
    expect((stamped.structuredOutput as { name?: string }).name).toBe(
      "PresentationRouteConcepts"
    );
    expect(stamped.presentationExpandMode).toBe("full");
  });

  it("skips EmailPlan for early full-copy phase", () => {
    const stamped = stampEmailCreateMetadata({
      service: "email",
      cdfPhaseId: "full-copy",
      cdfOmitStructuredOutput: true,
    });
    expect(stamped.structuredOutput).toBeUndefined();
  });

  it("shouldOmitCdfStructuredStamp reads early phase ids", () => {
    expect(
      shouldOmitCdfStructuredStamp({ cdfPhaseId: "sitemap" })
    ).toBe(true);
    expect(
      shouldOmitCdfStructuredStamp({ cdfPhaseId: "email-design" })
    ).toBe(false);
  });
});
