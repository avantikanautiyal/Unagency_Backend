/**
 * Presentation Deck → PDF (M5B).
 * Uses PDFKit (existing stack). One DeckSpec slide = one PDF page.
 * No AI. No DeckSpec mutation. Speaker notes are not drawn as page content.
 */

import PDFDocument from "pdfkit";
import { PRESENTATION_ARTIFACT_KEYS } from "../../artifacts/presentation/keys";
import type { ArtifactRenderer, CdfRendererInput, CdfRendererOutput } from "../types";
import { renderError } from "../errors";
import { buildCanonicalDeckRenderModel } from "./model";
import { normalizeHex } from "./tokens";

export const PDF_RENDERER_ID = "presentation-deck-pdf";
export const PDF_RENDERER_VERSION = "1.0.0";

function collectPdfBytes(doc: InstanceType<typeof PDFDocument>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });
}

export function createPresentationDeckPdfRenderer(): ArtifactRenderer {
  return {
    capability: {
      rendererId: PDF_RENDERER_ID,
      rendererVersion: PDF_RENDERER_VERSION,
      artifactKeys: [PRESENTATION_ARTIFACT_KEYS.deck],
      formats: ["pdf"],
      purposes: ["preview", "final"],
      description: "Canonical DeckSpec → PDF via PDFKit (M5B)",
    },
    canRender({ artifactKey, format }) {
      return artifactKey === PRESENTATION_ARTIFACT_KEYS.deck && format === "pdf";
    },
    async render(input: CdfRendererInput): Promise<CdfRendererOutput> {
      const strictFonts = input.options.extras?.strictFonts === true;
      const model = buildCanonicalDeckRenderModel({
        deckData: input.data as Record<string, unknown>,
        designSystemData: input.designSystem as
          | Record<string, unknown>
          | undefined,
        resolvedAssets: input.resolvedAssets,
        unit: "pt",
        strictFonts,
      });

      const doc = new PDFDocument({
        autoFirstPage: false,
        compress: false,
        info: {
          Title: model.title,
          Author: "UNAGENCY CDF Render",
          Creator: `${PDF_RENDERER_ID}@${PDF_RENDERER_VERSION}`,
        },
      });
      const done = collectPdfBytes(doc);

      for (const slideModel of model.slides) {
        doc.addPage({
          size: [model.slideSize.width, model.slideSize.height],
          margin: 0,
        });

        for (const p of slideModel.primitives) {
          doc.save();
          if (p.rect && "rotationDeg" in p && p.kind !== "background") {
            const cx = p.rect.x + p.rect.w / 2;
            const cy = p.rect.y + p.rect.h / 2;
            if (p.rect.rotationDeg) {
              doc.translate(cx, cy);
              doc.rotate(p.rect.rotationDeg);
              doc.translate(-cx, -cy);
            }
          }

          if (p.kind === "background") {
            doc.rect(0, 0, model.slideSize.width, model.slideSize.height);
            doc.fill(normalizeHex(p.color, "#FFFFFF"));
          } else if (p.kind === "shape") {
            doc.opacity(p.opacity);
            if (p.shape === "ellipse") {
              doc.ellipse(
                p.rect.x + p.rect.w / 2,
                p.rect.y + p.rect.h / 2,
                p.rect.w / 2,
                p.rect.h / 2,
              );
            } else if (p.shape === "line") {
              doc
                .moveTo(p.rect.x, p.rect.y)
                .lineTo(p.rect.x + p.rect.w, p.rect.y + p.rect.h);
            } else {
              doc.rect(p.rect.x, p.rect.y, p.rect.w, p.rect.h);
            }
            if (p.fill && p.shape !== "line") {
              if (p.stroke) {
                doc.fillAndStroke(
                  normalizeHex(p.fill),
                  normalizeHex(p.stroke),
                );
              } else {
                doc.fill(normalizeHex(p.fill));
              }
            } else if (p.stroke) {
              doc.lineWidth(p.strokeWidth || 1);
              doc.stroke(normalizeHex(p.stroke));
            } else if (p.shape === "line") {
              doc.lineWidth(p.strokeWidth || 1);
              doc.stroke(normalizeHex(p.fill ?? "#000000"));
            }
          } else if (p.kind === "text") {
            doc.opacity(p.opacity);
            doc.fillColor(normalizeHex(p.color));
            doc.font(p.font.pdfFont);
            doc.fontSize(p.fontSizePt);
            doc.text(p.content, p.rect.x, p.rect.y, {
              width: Math.max(p.rect.w, 1),
              height: Math.max(p.rect.h, 1),
              align: p.align === "justify" ? "justify" : p.align,
              ellipsis: false,
            });
          } else if (p.kind === "image") {
            doc.opacity(p.opacity);
            try {
              doc.image(Buffer.from(p.bytes), p.rect.x, p.rect.y, {
                width: Math.max(p.rect.w, 1),
                height: Math.max(p.rect.h, 1),
              });
            } catch (err) {
              throw renderError(
                "RENDER_FAILED",
                `Failed to embed image ${p.vaultAssetId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { vaultAssetId: p.vaultAssetId },
              );
            }
          } else if (p.kind === "table") {
            doc.opacity(p.opacity);
            doc.font(p.font.pdfFont);
            doc.fontSize(p.fontSizePt);
            doc.fillColor(normalizeHex(p.color));
            const rows = p.rows;
            const rowH =
              rows.length > 0 ? Math.max(p.rect.h / rows.length, 12) : 12;
            const cols = Math.max(...rows.map((r) => r.length), 1);
            const colW = Math.max(p.rect.w / cols, 1);
            rows.forEach((row, ri) => {
              row.forEach((cell, ci) => {
                const x = p.rect.x + ci * colW;
                const y = p.rect.y + ri * rowH;
                doc.rect(x, y, colW, rowH).stroke("#CCCCCC");
                doc.text(cell, x + 2, y + 2, {
                  width: colW - 4,
                  height: rowH - 4,
                });
              });
            });
          }
          doc.restore();
        }
        // Notes intentionally not drawn as page content (PPTX-only speaker notes).
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
