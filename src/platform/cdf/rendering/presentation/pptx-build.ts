/**
 * Build PPTX bytes from CanonicalDeckRenderModel using PptxGenJS.
 * Extracted so Jest can run this in a real Node child process.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import PptxGenJS from "pptxgenjs";
import type { CanonicalDeckRenderModel } from "./model";
import { pptxHex } from "./tokens";

function detectImageExt(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  return "png";
}

function isBoldFont(pdfFont: string): boolean {
  return /bold/i.test(pdfFont);
}

export type SerializableDeckRenderModel = Omit<CanonicalDeckRenderModel, "slides"> & {
  slides: Array<{
    slideId: string;
    order: number;
    notes?: string;
    primitives: Array<
      | {
          kind: "background";
          id: string;
          zIndex: number;
          color: string;
        }
      | {
          kind: "text";
          id: string;
          zIndex: number;
          rect: { x: number; y: number; w: number; h: number; rotationDeg: number };
          content: string;
          color: string;
          font: {
            pptxFontFace: string;
            pdfFont: string;
          };
          fontSizePt: number;
          align: string;
          opacity: number;
        }
      | {
          kind: "shape";
          id: string;
          zIndex: number;
          rect: { x: number; y: number; w: number; h: number; rotationDeg: number };
          shape: "rect" | "ellipse" | "line";
          fill?: string;
          stroke?: string;
          strokeWidth: number;
          opacity: number;
          cornerRadius?: number;
        }
      | {
          kind: "image";
          id: string;
          zIndex: number;
          rect: { x: number; y: number; w: number; h: number; rotationDeg: number };
          vaultAssetId: string;
          /** base64 */
          bytesBase64: string;
          opacity: number;
        }
      | {
          kind: "table";
          id: string;
          zIndex: number;
          rect: { x: number; y: number; w: number; h: number; rotationDeg: number };
          rows: string[][];
          color: string;
          font: { pptxFontFace: string; pdfFont: string };
          fontSizePt: number;
          opacity: number;
        }
    >;
  }>;
};

export function toSerializableModel(
  model: CanonicalDeckRenderModel,
): SerializableDeckRenderModel {
  return {
    ...model,
    slides: model.slides.map((s) => ({
      slideId: s.slideId,
      order: s.order,
      notes: s.notes,
      primitives: s.primitives.map((p) => {
        if (p.kind === "image") {
          return {
            kind: "image" as const,
            id: p.id,
            zIndex: p.zIndex,
            rect: p.rect,
            vaultAssetId: p.vaultAssetId,
            bytesBase64: Buffer.from(p.bytes).toString("base64"),
            opacity: p.opacity,
          };
        }
        if (p.kind === "text") {
          return {
            kind: "text" as const,
            id: p.id,
            zIndex: p.zIndex,
            rect: p.rect,
            content: p.content,
            color: p.color,
            font: {
              pptxFontFace: p.font.pptxFontFace,
              pdfFont: p.font.pdfFont,
            },
            fontSizePt: p.fontSizePt,
            align: p.align,
            opacity: p.opacity,
          };
        }
        if (p.kind === "table") {
          return {
            kind: "table" as const,
            id: p.id,
            zIndex: p.zIndex,
            rect: p.rect,
            rows: p.rows,
            color: p.color,
            font: {
              pptxFontFace: p.font.pptxFontFace,
              pdfFont: p.font.pdfFont,
            },
            fontSizePt: p.fontSizePt,
            opacity: p.opacity,
          };
        }
        return p;
      }),
    })),
  };
}

export async function buildPptxBytesFromSerializableModel(
  model: SerializableDeckRenderModel,
  opts?: { includeNotes?: boolean },
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: "CDF_DECK",
    width: model.slideSize.width,
    height: model.slideSize.height,
  });
  pptx.layout = "CDF_DECK";
  pptx.title = model.title;
  pptx.author = "UNAGENCY CDF Render";

  const tempFiles: string[] = [];
  try {
    for (const slideModel of model.slides) {
      const slide = pptx.addSlide();
      for (const p of slideModel.primitives) {
        if (p.kind === "background") {
          slide.addShape(pptx.ShapeType.rect, {
            x: 0,
            y: 0,
            w: model.slideSize.width,
            h: model.slideSize.height,
            fill: { color: pptxHex(p.color, "FFFFFF") },
            line: { color: pptxHex(p.color, "FFFFFF"), width: 0 },
          });
          continue;
        }
        if (p.kind === "shape") {
          const shapeOpts: Record<string, unknown> = {
            x: p.rect.x,
            y: p.rect.y,
            w: Math.max(p.rect.w, 0.01),
            h: Math.max(p.rect.h, 0.01),
            rotate: p.rect.rotationDeg,
          };
          if (p.fill) {
            shapeOpts.fill = {
              color: pptxHex(p.fill),
              ...(p.opacity < 1
                ? { transparency: Math.round((1 - p.opacity) * 100) }
                : {}),
            };
          }
          shapeOpts.line = p.stroke
            ? { color: pptxHex(p.stroke), width: p.strokeWidth || 1 }
            : { width: 0 };
          const shapeType =
            p.shape === "ellipse"
              ? pptx.ShapeType.ellipse
              : p.shape === "line"
                ? pptx.ShapeType.line
                : p.cornerRadius
                  ? pptx.ShapeType.roundRect
                  : pptx.ShapeType.rect;
          if (p.cornerRadius != null && p.shape === "rect") {
            shapeOpts.rectRadius = Math.min(0.5, Number(p.cornerRadius) || 0);
          }
          slide.addShape(shapeType, shapeOpts);
          continue;
        }
        if (p.kind === "text") {
          slide.addText(p.content, {
            x: p.rect.x,
            y: p.rect.y,
            w: Math.max(p.rect.w, 0.01),
            h: Math.max(p.rect.h, 0.01),
            fontFace: p.font.pptxFontFace,
            fontSize: p.fontSizePt,
            color: pptxHex(p.color),
            align: (p.align === "justify" ? "justify" : p.align) as
              | "left"
              | "center"
              | "right"
              | "justify",
            valign: "top",
            rotate: p.rect.rotationDeg,
            wrap: true,
            bold: isBoldFont(p.font.pdfFont),
          });
          continue;
        }
        if (p.kind === "image") {
          const bytes = Buffer.from(p.bytesBase64, "base64");
          const ext = detectImageExt(bytes);
          const tmp = path.join(
            os.tmpdir(),
            `cdf-pptx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
          );
          fs.writeFileSync(tmp, bytes);
          tempFiles.push(tmp);
          slide.addImage({
            path: tmp,
            x: p.rect.x,
            y: p.rect.y,
            w: Math.max(p.rect.w, 0.01),
            h: Math.max(p.rect.h, 0.01),
            rotate: p.rect.rotationDeg,
            sizing: {
              type: "cover",
              w: Math.max(p.rect.w, 0.01),
              h: Math.max(p.rect.h, 0.01),
            },
          });
          continue;
        }
        if (p.kind === "table") {
          slide.addTable(
            p.rows.map((row) =>
              row.map((cell) => ({
                text: cell,
                options: {
                  fontFace: p.font.pptxFontFace,
                  fontSize: p.fontSizePt,
                  color: pptxHex(p.color),
                },
              })),
            ),
            {
              x: p.rect.x,
              y: p.rect.y,
              w: Math.max(p.rect.w, 0.01),
              border: { pt: 0.5, color: "CCCCCC" },
            },
          );
        }
      }
      if (slideModel.notes && opts?.includeNotes !== false) {
        slide.addNotes(slideModel.notes);
      }
    }

    return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  } finally {
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}
