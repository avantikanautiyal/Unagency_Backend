/**
 * Final authority-boundary regressions.
 * Proves CDF seal survives presentation/website/document enrichment attempts.
 */

import {
  applyCdfExecutionAuthority,
  reassertCdfExecutionAuthority,
  resolveExecutionOutputAuthority,
  CDF_EXECUTION_AUTHORITY_META,
  CDF_EXECUTION_CONTRACT_CONFLICT,
} from "../../../src/platform/cdf/execution-authority";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { stampCanonicalStructuredOutputMetadata } from "../../../src/platform/cdf/structured-output-contract";
import { stampPresentationCreateMetadata } from "../../../src/platform/direct/presentation-direct-metadata";
import { stampDocumentCreateMetadata } from "../../../src/platform/direct/document-direct-metadata";
import { stampEmailCreateMetadata } from "../../../src/platform/direct/email-direct-metadata";
import { sanitizeMediaGenerationCreateMetadata } from "../../../src/platform/api/services/execution-thin-path";
import { verifyOutputKindConsistency } from "../../../src/platform/os/observability/production-execution-integrity";

describe("CDF authority boundary seal", () => {
  const routesMeta = {
    cdfServiceId: "social-media",
    cdfPhaseId: "routes",
    cdfSessionId: "cdf_mtzn5273_zx311y8o",
    cdfExecutionStrategy: "canonical",
    service: "social",
    subtype: "content-design",
    outputKind: "image",
    outputModalities: ["image"],
    exampleDeliverable: "PNG/JPG",
  };

  it("seals text authority and survives presentation/document/email/website stamp attempts", () => {
    const applied = applyCdfExecutionAuthority({
      metadata: routesMeta,
      proposedOutputKind: "image",
      executionSpecOutputKind: undefined,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.metadata.outputKind).toBe("text");
    expect(applied.metadata.capabilityId).toBe("text.generate");
    expect(applied.metadata[CDF_EXECUTION_AUTHORITY_META.applied]).toBe(true);

    // Simulate later enrichment writers that historically forced other kinds.
    let meta = {
      ...applied.metadata,
      outputKind: "presentation",
      structuredOutput: {
        name: "PresentationRouteConcepts",
        schema: { type: "object" },
      },
    };
    meta = stampPresentationCreateMetadata(meta);
    meta = stampDocumentCreateMetadata(meta);
    meta = stampEmailCreateMetadata(meta);
    meta = {
      ...meta,
      outputKind: "deferred_website",
      structuredOutput: {
        name: "WebsiteRoutes",
        schema: { type: "object" },
      },
    };
    meta = stampCanonicalStructuredOutputMetadata(meta);
    meta = reassertCdfExecutionAuthority(meta);

    expect(meta.outputKind).toBe("text");
    expect(meta.capabilityId).toBe("text.generate");
    expect(meta.outputModalities).toEqual(["text"]);
    expect((meta.structuredOutput as { name: string }).name).toBe(
      "CdfSocialMediaRoutes",
    );
  });

  it("defers ExecutionSpec image against CDF text; sealed kind stays text", () => {
    const result = applyCdfExecutionAuthority({
      metadata: routesMeta,
      proposedOutputKind: "image",
      executionSpecOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.cdfExecutionSpecConflict).toBe(true);
    expect(result.deferredConflict?.code).toBe(CDF_EXECUTION_CONTRACT_CONFLICT);
  });

  it("media sanitize cannot reinterpret sealed CDF text as image", () => {
    const applied = applyCdfExecutionAuthority({
      metadata: routesMeta,
      proposedOutputKind: "image",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const sanitized = sanitizeMediaGenerationCreateMetadata({
      metadata: applied.metadata,
      capabilityId: "image.generate",
      structuredOutput: { name: "LaunchPlan", schema: {} },
    });
    const sealed = reassertCdfExecutionAuthority(sanitized.metadata);
    expect(sealed.outputKind).toBe("text");
  });

  it("resolveExecutionOutputAuthority uses CDF not catalog", () => {
    const applied = applyCdfExecutionAuthority({
      metadata: routesMeta,
      proposedOutputKind: "image",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const auth = resolveExecutionOutputAuthority({
      metadata: applied.metadata,
      catalogOutputKind: "image",
      declaredOutputKind: "text",
    });
    expect(auth.authoritySource).toBe("cdf_execution_contract");
    expect(auth.authoritativeOutputKind).toBe("text");
    expect(auth.catalogOutputKind).toBe("image");
  });

  it("integrity does not FAIL on catalog vs CDF authority disagreement", () => {
    const applied = applyCdfExecutionAuthority({
      metadata: routesMeta,
      proposedOutputKind: "image",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(
      verifyOutputKindConsistency({
        service: "social",
        subtype: "content-design",
        declaredOutputKind: "text",
        capabilityId: "text.generate",
        metadata: applied.metadata,
      }),
    ).toBeUndefined();
  });

  it("registry declares structuredOutputContract for emission phases", () => {
    const routes = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "routes",
    });
    expect(routes?.structuredOutputContract?.name).toBe("CdfSocialMediaRoutes");
    expect(routes?.requiredCapability).toBe("text.generate");

    const storyline = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    expect(storyline?.structuredOutputContract?.name).toBe(
      "CdfPresentationStoryline",
    );
    expect(storyline?.requiredCapability).toBe("text.generate");

    const packaging = resolveCdfPhaseExecutionContract({
      serviceId: "packaging",
      phaseId: "routes",
    });
    expect(packaging?.structuredOutputContract?.name).toBe(
      "CdfPackagingRoutes",
    );

    const output = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(output?.requiredCapability).toBe("image.generate");
    expect(output?.generationModality).toBe("image");
  });
});
