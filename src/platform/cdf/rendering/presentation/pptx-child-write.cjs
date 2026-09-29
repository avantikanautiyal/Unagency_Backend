#!/usr/bin/env node
/**
 * Child-process PPTX builder for Jest (real Node can dynamic-import node:fs).
 * stdin: JSON { model, includeNotes }
 * stdout: base64 PPTX bytes
 */

const fs = require("fs");
const path = require("path");

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("usage: pptx-child-write.cjs <input.json>");
    process.exit(2);
  }
  const raw = fs.readFileSync(inputPath, "utf8");
  const { model, includeNotes } = JSON.parse(raw);

  // Resolve compiled or ts-jest path — require the built helper via ts-node/register is heavy.
  // Inline minimal require of dist is unavailable; use dynamic path to source via ts-jest not here.
  // Instead: duplicate call through require of compiled JS from the same folder after ts-jest transform.
  // For reliability, implement the builder inline using pptxgenjs here.

  const PptxGenJS = require("pptxgenjs");
  const os = require("os");

  function pptxHex(raw, fallback = "000000") {
    let t = String(raw || "").trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
      if (t.length === 4) {
        t = `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
      }
      return t.slice(1).toUpperCase();
    }
    if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t.toUpperCase();
    return fallback;
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: "CDF_DECK",
    width: model.slideSize.width,
    height: model.slideSize.height,
  });
  pptx.layout = "CDF_DECK";
  pptx.title = model.title || "Deck";
  pptx.author = "UNAGENCY CDF Render";

  const tempFiles = [];
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
      } else if (p.kind === "shape") {
        const opts = {
          x: p.rect.x,
          y: p.rect.y,
          w: Math.max(p.rect.w, 0.01),
          h: Math.max(p.rect.h, 0.01),
          rotate: p.rect.rotationDeg || 0,
          line: p.stroke
            ? { color: pptxHex(p.stroke), width: p.strokeWidth || 1 }
            : { width: 0 },
        };
        if (p.fill) {
          opts.fill = {
            color: pptxHex(p.fill),
            ...(p.opacity < 1
              ? { transparency: Math.round((1 - p.opacity) * 100) }
              : {}),
          };
        }
        const shapeType =
          p.shape === "ellipse"
            ? pptx.ShapeType.ellipse
            : p.shape === "line"
              ? pptx.ShapeType.line
              : p.cornerRadius
                ? pptx.ShapeType.roundRect
                : pptx.ShapeType.rect;
        if (p.cornerRadius != null && p.shape === "rect") {
          opts.rectRadius = Math.min(0.5, Number(p.cornerRadius) || 0);
        }
        slide.addShape(shapeType, opts);
      } else if (p.kind === "text") {
        slide.addText(p.content, {
          x: p.rect.x,
          y: p.rect.y,
          w: Math.max(p.rect.w, 0.01),
          h: Math.max(p.rect.h, 0.01),
          fontFace: p.font.pptxFontFace,
          fontSize: p.fontSizePt,
          color: pptxHex(p.color),
          align: p.align === "justify" ? "justify" : p.align,
          valign: "top",
          rotate: p.rect.rotationDeg || 0,
          wrap: true,
          bold: /bold/i.test(p.font.pdfFont || ""),
        });
      } else if (p.kind === "image") {
        const bytes = Buffer.from(p.bytesBase64, "base64");
        const tmp = path.join(
          os.tmpdir(),
          `cdf-child-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
        );
        fs.writeFileSync(tmp, bytes);
        tempFiles.push(tmp);
        slide.addImage({
          path: tmp,
          x: p.rect.x,
          y: p.rect.y,
          w: Math.max(p.rect.w, 0.01),
          h: Math.max(p.rect.h, 0.01),
          rotate: p.rect.rotationDeg || 0,
        });
      } else if (p.kind === "table") {
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
    if (slideModel.notes && includeNotes !== false) {
      slide.addNotes(slideModel.notes);
    }
  }

  const buf = await pptx.write({ outputType: "nodebuffer" });
  for (const f of tempFiles) {
    try {
      fs.unlinkSync(f);
    } catch (_) {}
  }
  process.stdout.write(Buffer.from(buf).toString("base64"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
