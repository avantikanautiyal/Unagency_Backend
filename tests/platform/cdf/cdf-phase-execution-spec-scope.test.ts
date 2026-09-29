/**
 * Phase-scoped ExecutionSpec authority — product final deliverables vs CDF phase.
 *
 * Product-default PNG/JPG/PDF/DOCX must not manufacture a hard create failure
 * on intermediate CDF phases. Incompatible Spec is deferred; CDF remains
 * authoritative.
 */

import {
  applyCdfExecutionAuthority,
  CDF_EXECUTION_CONTRACT_CONFLICT,
  CDF_EXECUTION_AUTHORITY_META,
  outputKindFromCdfContract,
  resolvePhaseAuthoritativeExecutionSpecOutputKind,
  kindsConflict,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { deliverableToOutputKindOverride } from "../../../src/platform/collaboration/conversational-task-intelligence";

describe("resolvePhaseAuthoritativeExecutionSpecOutputKind", () => {
  it("defers product-default image deliverables for text CDF kind", () => {
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: "text",
      outputKindFromAllDeliverables: "image",
      outputKindFromExplicitDeliverables: undefined,
    });
    expect(scoped.authority).toBe("deferred_product_default");
    expect(scoped.executionSpecOutputKind).toBeUndefined();
    expect(scoped.deferredProductOutputKind).toBe("image");
  });

  it("defers explicit image deliverables incompatible with text CDF", () => {
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: "text",
      outputKindFromAllDeliverables: "image",
      outputKindFromExplicitDeliverables: "image",
    });
    expect(scoped.authority).toBe("deferred_incompatible_spec");
    expect(scoped.executionSpecOutputKind).toBeUndefined();
    expect(scoped.deferredProductOutputKind).toBe("image");
  });

  it("defers explicit PDF/DOCX document Spec for text CDF", () => {
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: "text",
      outputKindFromAllDeliverables: "document",
      outputKindFromExplicitDeliverables: "document",
    });
    expect(scoped.authority).toBe("deferred_incompatible_spec");
    expect(scoped.executionSpecOutputKind).toBeUndefined();
    expect(scoped.deferredProductOutputKind).toBe("document");
  });

  it("allows compatible product defaults for image CDF kind", () => {
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: "image",
      outputKindFromAllDeliverables: "image",
    });
    expect(scoped.authority).toBe("compatible_product_default");
    expect(scoped.executionSpecOutputKind).toBe("image");
  });
});

describe("CDF phase Spec scope matrix", () => {
  function authorityWithScopedSpec(input: {
    serviceId: string;
    phaseId: string;
    catalogOutputKind: string;
    productDefaultDeliverables: Array<"PNG" | "JPG" | "PDF" | "PPTX" | "DOCX">;
    explicitDeliverables?: Array<"PNG" | "JPG" | "PDF" | "PPTX" | "DOCX">;
  }) {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: input.serviceId,
      phaseId: input.phaseId,
    });
    expect(contract).toBeDefined();
    const cdfKind = outputKindFromCdfContract(contract!);
    const allDeliverables = [
      ...(input.explicitDeliverables ?? []).map((format) => ({
        format,
        required: true,
        editable: false,
        provenance: { source: "EXPLICIT_USER" as const, explicit: true },
      })),
      ...input.productDefaultDeliverables.map((format) => ({
        format,
        required: false,
        editable: false,
        provenance: { source: "DEFAULT" as const, explicit: false },
      })),
    ];
    const allKind = deliverableToOutputKindOverride(allDeliverables, {
      service: input.serviceId,
    });
    const explicitKind = input.explicitDeliverables?.length
      ? deliverableToOutputKindOverride(
          allDeliverables.filter((d) => d.provenance.explicit),
          { service: input.serviceId },
        )
      : undefined;
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: cdfKind,
      outputKindFromAllDeliverables: allKind,
      outputKindFromExplicitDeliverables: explicitKind,
    });
    return applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: input.serviceId,
        cdfPhaseId: input.phaseId,
        cdfSessionId: "cdf_phase_scope_test",
        cdfExecutionStrategy: "canonical",
        service: input.serviceId,
        outputKind: input.catalogOutputKind,
        outputModalities: [input.catalogOutputKind],
        exampleDeliverable: input.productDefaultDeliverables.join("/"),
        cdfExecutionSpecKindAuthority: scoped.authority,
        ...(scoped.deferredProductOutputKind
          ? { cdfDeferredProductOutputKind: scoped.deferredProductOutputKind }
          : {}),
      },
      proposedOutputKind: input.catalogOutputKind,
      executionSpecOutputKind: scoped.executionSpecOutputKind,
    });
  }

  it("1. non-visual routes + product PNG/JPG defaults → SUCCESS text", () => {
    const result = authorityWithScopedSpec({
      serviceId: "social-media",
      phaseId: "routes",
      catalogOutputKind: "image",
      productDefaultDeliverables: ["PNG", "JPG"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(true);
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.capabilityId).toBe("text.generate");
    expect(result.metadata.outputModalities).toEqual(["text"]);
    expect(result.metadata[CDF_EXECUTION_AUTHORITY_META.applied]).toBe(true);
  });

  it("2. non-visual routes + explicit image Spec → defer; CDF text wins", () => {
    const result = authorityWithScopedSpec({
      serviceId: "social-media",
      phaseId: "routes",
      catalogOutputKind: "image",
      productDefaultDeliverables: ["PNG", "JPG"],
      explicitDeliverables: ["PNG"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.capabilityId).toBe("text.generate");
  });

  it("3. visual output phase + image product defaults → SUCCESS image", () => {
    const result = authorityWithScopedSpec({
      serviceId: "social-media",
      phaseId: "output",
      catalogOutputKind: "image",
      productDefaultDeliverables: ["PNG", "JPG"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("image");
    expect(result.metadata.capabilityId).toBe("image.generate");
  });

  it("4. visual output + explicit compatible image Spec → SUCCESS", () => {
    const result = authorityWithScopedSpec({
      serviceId: "social-media",
      phaseId: "output",
      catalogOutputKind: "image",
      productDefaultDeliverables: [],
      explicitDeliverables: ["PNG", "JPG"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("image");
  });

  it("5. presentation storyline + catalog visual defaults → no manufactured conflict", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "storyline",
    });
    expect(contract).toBeDefined();
    const cdfKind = outputKindFromCdfContract(contract!);
    const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
      cdfOutputKind: cdfKind,
      outputKindFromAllDeliverables: "image",
    });
    if (cdfKind && kindsConflict(cdfKind, "image")) {
      expect(scoped.authority).toBe("deferred_product_default");
      expect(scoped.executionSpecOutputKind).toBeUndefined();
    }
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "presentation",
        cdfPhaseId: "storyline",
        cdfSessionId: "cdf_storyline_scope",
        cdfExecutionStrategy: "canonical",
        outputKind: "image",
      },
      proposedOutputKind: "image",
      executionSpecOutputKind: scoped.executionSpecOutputKind,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (cdfKind) {
      expect(result.metadata.outputKind).toBe(cdfKind);
    }
  });

  it("6. incompatible Spec is deferred — CDF sealed (invariant)", () => {
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "routes",
        cdfSessionId: "cdf_explicit_conflict",
        cdfExecutionStrategy: "canonical",
        outputKind: "text",
      },
      proposedOutputKind: "text",
      executionSpecOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("text");
    expect(result.metadata.cdfExecutionSpecConflict).toBe(true);
    expect(result.deferredConflict?.code).toBe(CDF_EXECUTION_CONTRACT_CONFLICT);
  });

  it("7. final visual phase still receives image execution", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    expect(contract!.generationModality).toBe("image");
    expect(outputKindFromCdfContract(contract!)).toBe("image");
    const result = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfSessionId: "cdf_output_image",
        cdfExecutionStrategy: "canonical",
        outputKind: "image",
      },
      proposedOutputKind: "image",
      executionSpecOutputKind: "image",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.outputKind).toBe("image");
    expect(result.metadata.capabilityId).toBe("image.generate");
    expect(result.metadata.outputModalities).toEqual(["image"]);
  });
});
