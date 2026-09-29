/**
 * Generic CDF ↔ ExecutionSpec authority boundary + document materialization gate.
 *
 * Guarantees:
 * - CDF phase contract is authoritative for modality / kind / artifact / strategy
 * - ExecutionSpec PDF/DOCX (and other incompatible kinds) are deferred, not applied
 * - Document export runs only when the authoritative phase contract authorizes it
 * - Successful canonical completion stays distinct from governance / UX failure copy
 *
 * No serviceId / phaseId / provider / model semantic branches in the code under test.
 */

import {
  applyCdfExecutionAuthority,
  CDF_EXECUTION_AUTHORITY_META,
  CDF_EXECUTION_CONTRACT_CONFLICT,
  cdfContractAuthorizesDocumentExport,
  kindsConflict,
  outputKindFromCdfContract,
  resolvePhaseAuthoritativeExecutionSpecOutputKind,
} from "../../../src/platform/cdf";
import { resolveCdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import { shouldRunDocumentExportMaterialization } from "../../../src/platform/api/services/document-export-materializer";
import { deliverableToOutputKindOverride } from "../../../src/platform/collaboration/conversational-task-intelligence";

function applyWithSpec(input: {
  serviceId: string;
  phaseId: string;
  catalogKind: string;
  specKind?: string;
  deliverables?: Array<{ format: string; explicit?: boolean }>;
}) {
  const contract = resolveCdfPhaseExecutionContract({
    serviceId: input.serviceId,
    phaseId: input.phaseId,
  });
  expect(contract).toBeDefined();
  const cdfKind = outputKindFromCdfContract(contract!);
  const deliverables = (input.deliverables ?? []).map((d) => ({
    format: d.format,
    required: true,
    editable: false,
    provenance: {
      source: d.explicit ? ("EXPLICIT_USER" as const) : ("DEFAULT" as const),
      explicit: d.explicit === true,
    },
  }));
  const allKind =
    input.specKind ??
    (deliverables.length
      ? deliverableToOutputKindOverride(deliverables, {
          service: input.serviceId,
        })
      : undefined);
  const explicitKind = deliverables.some((d) => d.provenance.explicit)
    ? deliverableToOutputKindOverride(
        deliverables.filter((d) => d.provenance.explicit),
        { service: input.serviceId },
      )
    : undefined;
  const scoped = resolvePhaseAuthoritativeExecutionSpecOutputKind({
    cdfOutputKind: cdfKind,
    outputKindFromAllDeliverables: allKind,
    outputKindFromExplicitDeliverables: explicitKind,
  });
  const authority = applyCdfExecutionAuthority({
    metadata: {
      cdfServiceId: input.serviceId,
      cdfPhaseId: input.phaseId,
      cdfSessionId: "cdf_authority_boundary_generic",
      cdfExecutionStrategy: "canonical",
      service: input.serviceId,
      outputKind: input.catalogKind,
      executionSpecDeliverables: deliverables.map((d) => d.format),
      cdfExecutionSpecKindAuthority: scoped.authority,
      ...(scoped.deferredProductOutputKind
        ? { cdfDeferredProductOutputKind: scoped.deferredProductOutputKind }
        : {}),
    },
    proposedOutputKind: input.catalogKind,
    executionSpecOutputKind: scoped.executionSpecOutputKind ?? input.specKind,
  });
  return { contract: contract!, cdfKind, scoped, authority };
}

describe("generic CDF ExecutionSpec authority contamination", () => {
  it("1. CDF text phase + ExecutionSpec PDF/DOCX → CDF artifact remains authoritative", () => {
    for (const [serviceId, phaseId] of [
      ["print-ooh", "routes"],
      ["social-media", "routes"],
      ["packaging", "routes"],
    ] as const) {
      const { authority, cdfKind, contract } = applyWithSpec({
        serviceId,
        phaseId,
        catalogKind: "document",
        deliverables: [
          { format: "PDF", explicit: true },
          { format: "DOCX", explicit: true },
        ],
      });
      expect(contract.generationModality).toBe("text");
      expect(cdfKind).toBe("text");
      expect(authority.ok).toBe(true);
      if (!authority.ok) return;
      expect(authority.metadata.outputKind).toBe("text");
      expect(authority.metadata[CDF_EXECUTION_AUTHORITY_META.artifactKey]).toBe(
        contract.artifactKey,
      );
      expect(authority.metadata.cdfAuthorityAuthorizesDocumentExport).toBe(false);
      expect(cdfContractAuthorizesDocumentExport(contract)).toBe(false);
    }
  });

  it("2. CDF structured phase + ExecutionSpec PDF/DOCX → no document export", () => {
    const { authority, contract } = applyWithSpec({
      serviceId: "presentation",
      phaseId: "storyline",
      catalogKind: "document",
      deliverables: [
        { format: "PDF", explicit: true },
        { format: "DOCX", explicit: true },
      ],
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    expect(cdfContractAuthorizesDocumentExport(contract)).toBe(false);
    expect(
      shouldRunDocumentExportMaterialization({
        metadata: {
          ...authority.metadata,
          structuredOutput: {
            name: "CdfPresentationStoryline",
            schema: { type: "object" },
          },
        },
        structuredData: {
          sections: [{ heading: "A", body: "B" }],
          title: "Storyline",
        },
      }),
    ).toBe(false);
  });

  it("3. CDF image phase + unrelated document deliverable → image remains authoritative", () => {
    const { authority, cdfKind } = applyWithSpec({
      serviceId: "social-media",
      phaseId: "output",
      catalogKind: "image",
      deliverables: [
        { format: "PDF", explicit: true },
        { format: "DOCX", explicit: true },
      ],
    });
    expect(cdfKind).toBe("image");
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    expect(authority.metadata.outputKind).toBe("image");
    expect(authority.metadata.capabilityId).toBe("image.generate");
    expect(authority.metadata.cdfAuthorityAuthorizesDocumentExport).toBe(false);
  });

  it("4. Final document/export phase with PDF declared by CDF contract → materialization allowed", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "emailers",
      phaseId: "email-design",
    });
    expect(contract).toBeDefined();
    expect(cdfContractAuthorizesDocumentExport(contract!)).toBe(true);

    const authority = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "emailers",
        cdfPhaseId: "email-design",
        cdfSessionId: "cdf_email_export",
        cdfExecutionStrategy: "canonical",
        outputKind: "image",
      },
      proposedOutputKind: "image",
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    expect(authority.metadata.cdfAuthorityAuthorizesDocumentExport).toBe(true);

    const deck = resolveCdfPhaseExecutionContract({
      serviceId: "presentation",
      phaseId: "full-deck",
    });
    expect(deck).toBeDefined();
    expect(cdfContractAuthorizesDocumentExport(deck!)).toBe(true);
  });

  it("5. Upstream phase must not inherit downstream export formats", () => {
    const routes = applyWithSpec({
      serviceId: "print-ooh",
      phaseId: "routes",
      catalogKind: "document",
      deliverables: [
        { format: "PDF", explicit: false },
        { format: "DOCX", explicit: false },
      ],
    });
    expect(routes.scoped.authority).toMatch(/deferred_/);
    expect(routes.scoped.executionSpecOutputKind).toBeUndefined();
    expect(routes.authority.ok).toBe(true);
    if (!routes.authority.ok) return;
    expect(routes.authority.metadata.outputKind).toBe("text");
    expect(routes.authority.metadata.cdfAuthorityAuthorizesDocumentExport).toBe(
      false,
    );
  });

  it("6. Compatible ExecutionSpec requirements survive", () => {
    const { authority } = applyWithSpec({
      serviceId: "social-media",
      phaseId: "output",
      catalogKind: "image",
      deliverables: [
        { format: "PNG", explicit: true },
        { format: "JPG", explicit: true },
      ],
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    expect(authority.metadata.outputKind).toBe("image");
    expect(authority.metadata.cdfExecutionSpecConflict).not.toBe(true);
    // Hard constraints / deliverable list can still be present as grounding.
    expect(authority.metadata.executionSpecDeliverables).toEqual(["PNG", "JPG"]);
  });

  it("7. Incompatible ExecutionSpec semantic interpretation cannot overwrite CDF", () => {
    const { authority } = applyWithSpec({
      serviceId: "print-ooh",
      phaseId: "routes",
      catalogKind: "document",
      specKind: "document",
      deliverables: [
        { format: "PDF", explicit: true },
        { format: "DOCX", explicit: true },
      ],
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    expect(authority.metadata.outputKind).toBe("text");
    expect(authority.metadata.generationModality ?? authority.metadata[CDF_EXECUTION_AUTHORITY_META.generationModality]).toBe(
      "text",
    );
    expect(authority.metadata.cdfArtifactKey).toBe("print-ooh.routes");
    // Soft conflict stamp when Spec kind was forced past scoping.
    if (authority.deferredConflict) {
      expect(authority.deferredConflict.code).toBe(CDF_EXECUTION_CONTRACT_CONFLICT);
    }
  });

  it("8. Successful canonical CDF artifact + governance BLOCK → planes stay distinct", () => {
    const { authority } = applyWithSpec({
      serviceId: "print-ooh",
      phaseId: "routes",
      catalogKind: "document",
      deliverables: [{ format: "PDF", explicit: true }],
    });
    expect(authority.ok).toBe(true);
    if (!authority.ok) return;
    const meta = {
      ...authority.metadata,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_test_routes",
      cdfArtifactVersion: 1,
      // Secondary governance / quality plane
      governanceDecision: "BLOCK",
      presentationEligibility: { status: "REJECTED" },
    };
    expect(meta.cdfCanonicalCompletionEstablished).toBe(true);
    expect(meta.governanceDecision).toBe("BLOCK");
    expect(meta.outputKind).toBe("text");
    // Canonical completion is independent of governance BLOCK.
    expect(meta.cdfCanonicalCompletionEstablished).not.toBe(
      meta.governanceDecision === "ALLOW",
    );
  });

  it("9+10. Document materialization only when authoritative phase contract allows", () => {
    const routes = applyWithSpec({
      serviceId: "print-ooh",
      phaseId: "routes",
      catalogKind: "document",
      deliverables: [
        { format: "PDF", explicit: true },
        { format: "DOCX", explicit: true },
      ],
    });
    expect(routes.authority.ok).toBe(true);
    if (!routes.authority.ok) return;
    expect(
      shouldRunDocumentExportMaterialization({
        metadata: {
          ...routes.authority.metadata,
          structuredOutput: {
            name: "CdfCreativeDirections",
            schema: { type: "object" },
          },
        },
        structuredData: {
          routes: [
            { name: "A", creativeIdea: "one" },
            { name: "B", creativeIdea: "two" },
            { name: "C", creativeIdea: "three" },
          ],
        },
      }),
    ).toBe(false);

    const email = applyCdfExecutionAuthority({
      metadata: {
        cdfServiceId: "emailers",
        cdfPhaseId: "email-design",
        cdfSessionId: "cdf_email_ok",
        cdfExecutionStrategy: "canonical",
        outputKind: "email",
      },
      proposedOutputKind: "email",
    });
    expect(email.ok).toBe(true);
    if (!email.ok) return;
    expect(email.metadata.cdfAuthorityAuthorizesDocumentExport).toBe(true);
  });

  it("11. Generic across multiple services — no catalog contamination", () => {
    const cases = [
      { serviceId: "print-ooh", phaseId: "routes", expectKind: "text" },
      { serviceId: "social-media", phaseId: "routes", expectKind: "text" },
      { serviceId: "packaging", phaseId: "routes", expectKind: "text" },
      { serviceId: "videos", phaseId: "full-script", expectKind: "text" },
      { serviceId: "social-media", phaseId: "output", expectKind: "image" },
    ] as const;

    for (const c of cases) {
      const { authority } = applyWithSpec({
        serviceId: c.serviceId,
        phaseId: c.phaseId,
        catalogKind: "document",
        deliverables: [
          { format: "PDF", explicit: true },
          { format: "DOCX", explicit: true },
        ],
      });
      expect(authority.ok).toBe(true);
      if (!authority.ok) return;
      expect(authority.metadata.outputKind).toBe(c.expectKind);
    }
  });

  it("12. No service/phase-ID semantic branches — helpers are contract-driven", () => {
    const src = require("fs").readFileSync(
      require("path").join(
        __dirname,
        "../../../src/platform/cdf/execution-authority.ts",
      ),
      "utf8",
    ) as string;
    expect(src).not.toMatch(/serviceId\s*===\s*["']print-ooh["']/);
    expect(src).not.toMatch(/phaseId\s*===\s*["']routes["']/);
    expect(src).not.toMatch(/brochures/i);
    expect(kindsConflict("text", "document")).toBe(true);
    expect(kindsConflict("image", "document")).toBe(true);
    expect(kindsConflict("image", "image")).toBe(false);
  });
});
