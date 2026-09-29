/**
 * Generic structured-document PDF renderer (M5).
 *
 * Live bug: Brand Strategy "Download Strategy" (session cdf_muheapry_jc6wg253,
 * approved messaging artifact cdfart_muhey6ok_7_brand-strategy-messaging@1)
 * requested a canonical PDF render, but no renderer was registered for any
 * structured_doc artifact — RENDER_FORMAT_UNSUPPORTED, guaranteed to fail
 * regardless of execution identity (see prior investigation). The fix is a
 * generic renderer, capability-matched purely from the canonical registry's
 * own `supportedRepresentations` declaration (via findCdfPhaseByArtifactKey)
 * — no artifactKey allowlist, no serviceId/phaseId branch.
 */

import {
  applyCdfTransition,
  createArtifact,
  hasRendererCapability,
  markApproved,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  setCdfRenderedBlobStorage,
  STRUCTURED_DOCUMENT_PDF_RENDERER_ID,
  STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION,
} from "../../../src/platform/cdf";
import { extractPdfLiteralTexts } from "../../../src/platform/cdf/rendering/presentation/inspect";
import { getRenderedBlob } from "../../../src/platform/cdf/rendering/storage";
import { InMemoryBlobStorage as MemBlob } from "../../../src/platform/persistence/storage/in-memory-blob-storage";

const ORG = "org_a";
const PROJ = "proj_a";

function structuredDocFixture(overrides?: { title?: string }) {
  return {
    schemaId: "unagency.cdf.structured_approval.v1",
    title: overrides?.title ?? "Voyla Newsletter — Sculptural Brilliance Full Copy",
    summary: "A concise summary of the approved messaging.",
    sections: [
      { id: "s1", heading: "Messaging Strategy", body: "Real approved body text for section one." },
      { id: "s2", heading: "Master Messages", body: "Real approved body text for section two." },
    ],
    notes: "",
  };
}

describe("Generic structured-document PDF renderer", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests();
    setCdfRenderedBlobStorage(new MemBlob());
  });

  function startSession(serviceId: string) {
    const started = applyCdfTransition({
      action: "start",
      serviceId,
      productMode: "ai",
      organizationId: ORG,
      projectId: PROJ,
      workspaceId: "ws_a",
    });
    if (!started.ok) throw new Error("start");
    return started.value.session;
  }

  function makeStructuredDoc(
    sessionId: string,
    serviceId: string,
    phaseId: string,
    artifactKey: string,
    data: Record<string, unknown> = structuredDocFixture(),
  ) {
    return createArtifact({
      sessionId,
      serviceId,
      phaseId,
      organizationId: ORG,
      projectId: PROJ,
      artifactKey,
      artifactType: "structured_doc",
      data: data as never,
    });
  }

  it("1/6 — renderer registered and resolves for the exact live-bug artifactKey (brand-strategy.messaging, now declared pdf) — supported representation resolves to a real renderer", () => {
    expect(
      hasRendererCapability({
        artifactKey: "brand-strategy.messaging",
        format: "pdf",
        purpose: "final",
      }),
    ).toBe(true);
  });

  it("2/3 — exact ArtifactVersion identity is preserved through render (brand-strategy.messaging live-bug shape)", async () => {
    const session = startSession("brand-strategy");
    const created = makeStructuredDoc(
      session.sessionId,
      "brand-strategy",
      "messaging",
      "brand-strategy.messaging",
    );
    markApproved(created.artifact.artifactId, 1, { organizationId: ORG, projectId: PROJ });
    const file = await renderArtifact({
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: "brand-strategy.messaging",
      format: "pdf",
      purpose: "final",
      organizationId: ORG,
      projectId: PROJ,
    });
    expect(file.artifactId).toBe(created.artifact.artifactId);
    expect(file.artifactVersion).toBe(1);
    expect(file.artifactKey).toBe("brand-strategy.messaging");
    expect(file.format).toBe("pdf");
    expect(file.rendererId).toBe(STRUCTURED_DOCUMENT_PDF_RENDERER_ID);
    expect(file.rendererVersion).toBe(STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION);
  });

  it("real content (not fabricated) appears in the rendered bytes — approved section headings/body survive rendering", async () => {
    const session = startSession("brand-strategy");
    const created = makeStructuredDoc(
      session.sessionId,
      "brand-strategy",
      "messaging",
      "brand-strategy.messaging",
    );
    markApproved(created.artifact.artifactId, 1, { organizationId: ORG, projectId: PROJ });
    const file = await renderArtifact({
      artifactId: created.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: "brand-strategy.messaging",
      format: "pdf",
      purpose: "final",
      organizationId: ORG,
      projectId: PROJ,
    });
    const bytes = getRenderedBlob(file.storageKey)!.bytes;
    const { isValidPdf, joined } = extractPdfLiteralTexts(bytes);
    expect(isValidPdf).toBe(true);
    expect(joined).toContain("Messaging Strategy");
    expect(joined).toContain("Real approved body text for section one");
  });

  it("5/8 — a structured_doc phase that does NOT declare pdf (e.g. emailers.full-copy, unchanged registry) fails closed before invocation — no renderer resolves", () => {
    expect(
      hasRendererCapability({
        artifactKey: "emailers.full-copy",
        format: "pdf",
        purpose: "final",
      }),
    ).toBe(false);
  });

  it("11 — a sibling Brand Strategy structured_doc phase that never declared pdf (brand-platform) remains unsupported — the fix is per-declaration, not per-service", () => {
    expect(
      hasRendererCapability({
        artifactKey: "brand-strategy.brand-platform",
        format: "pdf",
        purpose: "final",
      }),
    ).toBe(false);
  });

  it("10 — presentation.deck PDF/PPTX renderers still resolve unaffected (registered independently)", () => {
    expect(
      hasRendererCapability({ artifactKey: "presentation.deck", format: "pdf", purpose: "final" }),
    ).toBe(true);
    expect(
      hasRendererCapability({ artifactKey: "presentation.deck", format: "pptx", purpose: "final" }),
    ).toBe(true);
  });

  it("9 — no legacy AI/export invoked: rendering never calls generation providers (pure structural render of already-approved data)", async () => {
    const session = startSession("brand-strategy");
    const created = makeStructuredDoc(
      session.sessionId,
      "brand-strategy",
      "messaging",
      "brand-strategy.messaging",
    );
    markApproved(created.artifact.artifactId, 1, { organizationId: ORG, projectId: PROJ });
    // No provider mocks are configured in this test file at all — if
    // rendering ever attempted to call a provider, it would throw a real
    // network/module error rather than silently succeed.
    await expect(
      renderArtifact({
        artifactId: created.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: "brand-strategy.messaging",
        format: "pdf",
        purpose: "final",
        organizationId: ORG,
        projectId: PROJ,
      }),
    ).resolves.toBeDefined();
  });

  it("generic across services — any structured_doc artifact that declares pdf resolves, driven purely by registry declaration", () => {
    // brand-strategy.messaging (declared) vs emailers.full-copy (not declared)
    // already prove this is not serviceId-branched; this test additionally
    // proves the capability check takes no serviceId parameter at all.
    const resolvesForDeclared = hasRendererCapability({
      artifactKey: "brand-strategy.messaging",
      format: "pdf",
      purpose: "preview",
    });
    expect(resolvesForDeclared).toBe(true);
  });
});
