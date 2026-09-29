/**
 * Generic structured document → PDF (M5).
 *
 * Renders ANY canonical artifact whose registry phase declares
 * artifactType "structured_doc" or "text_doc" AND explicitly lists "pdf"
 * in its supportedRepresentations — not a specific artifactKey. Capability
 * is derived from the canonical registry contract (the same source of
 * truth `shouldUseCanonicalCdfRender` already checks on the frontend), so
 * a new structured-document phase becomes PDF-downloadable purely by
 * declaring `representations: [{ format: 'pdf' }]` on its artifact, with
 * no code change here and no serviceId/phaseId/artifactKey branch.
 *
 * Content shape rendered (the same generic shape
 * planFromGenericStructuredDocument already renders on the frontend):
 *   { title: string, summary?: string, sections: { heading, body }[] }
 *
 * No AI. No creative mutation. Pure text layout via PDFKit (existing stack).
 */

import PDFDocument from "pdfkit";
import { findCdfPhaseByArtifactKey } from "../../canonical";
import type { ArtifactRenderer, CdfRendererInput, CdfRendererOutput } from "../types";
import { renderError } from "../errors";

export const STRUCTURED_DOCUMENT_PDF_RENDERER_ID = "structured-document-pdf";
export const STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION = "1.0.0";

const STRUCTURED_DOCUMENT_ARTIFACT_TYPES = new Set(["structured_doc", "text_doc"]);

function collectPdfBytes(doc: InstanceType<typeof PDFDocument>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });
}

/** True when the artifact's own registry-declared phase supports this format generically. */
function canRenderArtifactKeyAsPdf(artifactKey: string): boolean {
  const phase = findCdfPhaseByArtifactKey(artifactKey);
  if (!phase) return false;
  if (!STRUCTURED_DOCUMENT_ARTIFACT_TYPES.has(phase.artifact.artifactType)) return false;
  return phase.artifact.supportedRepresentations.some((r) => r.format === "pdf");
}

type StructuredDocumentSection = { heading?: unknown; body?: unknown };

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asSections(value: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => entry as StructuredDocumentSection)
    .map((entry) => ({
      heading: asString(entry?.heading) || "Section",
      body: asString(entry?.body),
    }))
    .filter((s) => s.body.length > 0);
}

export function createStructuredDocumentPdfRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: STRUCTURED_DOCUMENT_PDF_RENDERER_ID,
      rendererVersion: STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION,
      // No static artifactKey allowlist — capability is derived dynamically
      // from the canonical registry contract via canRender().
      artifactKeys: [],
      formats: ["pdf"],
      purposes: ["preview", "final"],
      description:
        "Canonical structured_doc/text_doc artifact → PDF via PDFKit, generic text layout, capability driven by registry supportedRepresentations.",
    },
    canRender({ artifactKey, format }) {
      return format === "pdf" && canRenderArtifactKeyAsPdf(artifactKey);
    },
    async render(input: CdfRendererInput): Promise<CdfRendererOutput> {
      const data = input.data as {
        title?: unknown;
        summary?: unknown;
        sections?: unknown;
      };
      const title = asString(data.title) || "Document";
      const summary = asString(data.summary);
      const sections = asSections(data.sections);

      const doc = new PDFDocument({
        size: "A4",
        margin: 56,
        compress: false,
        info: {
          Title: title,
          Author: "UNAGENCY CDF Render",
          Creator: `${STRUCTURED_DOCUMENT_PDF_RENDERER_ID}@${STRUCTURED_DOCUMENT_PDF_RENDERER_VERSION}`,
        },
      });
      const done = collectPdfBytes(doc);

      doc.font("Helvetica-Bold").fontSize(22).text(title, { align: "left" });
      doc.moveDown(0.5);
      if (summary) {
        doc.font("Helvetica").fontSize(12).fillColor("#444444").text(summary);
        doc.fillColor("#000000");
        doc.moveDown(1);
      }

      for (const section of sections) {
        doc.font("Helvetica-Bold").fontSize(14).text(section.heading);
        doc.moveDown(0.25);
        doc.font("Helvetica").fontSize(11).text(section.body, {
          align: "left",
          lineGap: 2,
        });
        doc.moveDown(1);
      }

      doc.end();
      let bytes: Uint8Array;
      try {
        bytes = await done;
      } catch (err) {
        throw renderError(
          "RENDER_FAILED",
          err instanceof Error ? err.message : "PDF write failed",
        );
      }

      return { bytes, mimeType: "application/pdf" };
    },
  };
}
