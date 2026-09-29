/**
 * CDF early-phase create stamps must not force full structured schemas.
 * Authority: execution contract (artifactType + structuredEmission), not phase-ID Sets.
 */

import { shouldOmitCdfStructuredStamp } from "../../../src/platform/cdf/phase-scoped-create";
import { stampPresentationCreateMetadata } from "../../../src/platform/direct/presentation-direct-metadata";
import { stampEmailCreateMetadata } from "../../../src/platform/direct/email-direct-metadata";
import { resolveProductStructuredStampPolicy } from "../../../src/platform/cdf/canonical";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";

describe("CDF phase-scoped create stamps (contract-driven)", () => {
  it("skips PresentationRouteConcepts for storyline (dedicated CDF contract)", () => {
    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      cdfServiceId: "presentation",
      cdfPhaseId: "storyline",
      cdfOmitStructuredOutput: true,
      presentationExpandMode: "lazy",
    });
    expect(stamped.structuredOutput).toBeUndefined();
    expect(stamped.presentationExpandMode).toBe("lazy");
  });

  it("full-deck does not omit via contract (product expand allowed)", () => {
    // Contract authority: full-deck is a full-product-expand phase — omit=false.
    // Legacy PresentationRouteConcepts product stamp is NOT forced onto canonical
    // CDF emission phases (PresentationRoutes is stamped by stampCanonical).
    expect(
      shouldOmitCdfStructuredStamp({
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
      })
    ).toBe(false);

    const deck = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "full-deck",
    });
    const policy = resolveProductStructuredStampPolicy(deck);
    expect(policy.omitProductStructuredStamp).toBe(false);
    expect(policy.presentationExpandMode).toBe("full");
    expect(policy.structuredEmissionRequired).toBe(true);

    const stamped = stampPresentationCreateMetadata({
      service: "presentations",
      subtype: "pitch-decks",
      cdfServiceId: "presentation",
      cdfPhaseId: "full-deck",
      presentationExpandMode: "full",
    });
    // Direct product concepts stamp skipped for canonical emission phases.
    expect(stamped.structuredOutput).toBeUndefined();
    expect(stamped.presentationExpandMode).toBe("full");
  });

  it("skips EmailPlan for early full-copy phase", () => {
    const stamped = stampEmailCreateMetadata({
      service: "email",
      cdfServiceId: "emailers",
      cdfPhaseId: "full-copy",
      cdfOmitStructuredOutput: true,
    });
    expect(stamped.structuredOutput).toBeUndefined();
  });

  it("shouldOmitCdfStructuredStamp follows contract, not phase-ID Sets", () => {
    expect(
      shouldOmitCdfStructuredStamp({
        cdfServiceId: "web-tech",
        cdfPhaseId: "sitemap",
      })
    ).toBe(true);
    expect(
      shouldOmitCdfStructuredStamp({
        cdfServiceId: "emailers",
        cdfPhaseId: "email-design",
      })
    ).toBe(false);
    expect(
      shouldOmitCdfStructuredStamp({
        cdfServiceId: "presentation",
        cdfPhaseId: "full-deck",
      })
    ).toBe(false);

    const storyline = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    const deck = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "full-deck",
    });
    expect(resolveProductStructuredStampPolicy(storyline).omitProductStructuredStamp).toBe(
      true
    );
    expect(resolveProductStructuredStampPolicy(deck).omitProductStructuredStamp).toBe(
      false
    );
  });

  it("UI omit flag cannot force product omit off for dedicated emission phases", () => {
    // Storyline requires dedicated CDF schema — product stamps stay omitted
    // even without cdfOmitStructuredOutput.
    expect(
      shouldOmitCdfStructuredStamp({
        cdfServiceId: "presentation",
        cdfPhaseId: "storyline",
      })
    ).toBe(true);
  });
});
