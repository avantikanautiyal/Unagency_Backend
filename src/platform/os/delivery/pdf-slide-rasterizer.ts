/**
 * Slide preview images for exported presentation PDFs.
 *
 * The app previews a deck as the real designed slides (colours, imagery,
 * logo) — not a text outline — so each PDF page is rendered to a JPEG.
 * pdf.js draws the exact exported PDF inside headless Chrome (the same
 * puppeteer runtime the HTML/PDF exporters already use in production).
 *
 * Only PDFs this server just generated are rendered; eval is disabled anyway.
 */

import { readFile } from "fs/promises";
import path from "path";

const PREVIEW_WIDTH_PX = 1280;
const JPEG_QUALITY = 0.82;
const ORIGIN = "https://slides.render.local";

let pdfjsDir: string | null = null;
function pdfjsRoot(): string {
  pdfjsDir ??= path.dirname(require.resolve("pdfjs-dist/package.json"));
  return pdfjsDir;
}

/**
 * Runs inside the page. Kept as plain JS source so the TypeScript build never
 * rewrites it into helpers (e.g. __awaiter) that do not exist in the browser.
 */
const RENDER_ALL_PAGES = `async function (opts) {
  const lib = globalThis.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = opts.origin + "/pdf.worker.min.js";
  const doc = await lib.getDocument({
    url: opts.origin + "/deck.pdf?" + Math.random(),
    standardFontDataUrl: opts.origin + "/standard_fonts/",
    isEvalSupported: false,
  }).promise;
  const images = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: opts.width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", opts.quality));
  }
  await doc.destroy();
  return images;
}`;

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script src="${ORIGIN}/pdf.min.js"></script></head><body></body></html>`;

/**
 * Render every page of each PDF to a JPEG. Returns one array of images per
 * input PDF (same order). Never throws: a PDF that fails yields [].
 */
export async function rasterizePdfPages(
  pdfs: readonly Buffer[],
): Promise<Buffer[][]> {
  if (pdfs.length === 0) return [];
  let browser: import("puppeteer").Browser | undefined;
  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
      ...(process.env.PRODUCTION_PATH_PUPPITER
        ? { executablePath: process.env.PRODUCTION_PATH_PUPPITER }
        : {}),
    });
    const page = await browser.newPage();
    const root = pdfjsRoot();
    let currentPdf: Buffer = Buffer.alloc(0);

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      void (async () => {
        const url = req.url();
        if (!url.startsWith(ORIGIN)) return req.abort();
        const rel = url.slice(ORIGIN.length).split("?")[0] ?? "";
        try {
          if (rel === "/" || rel === "/index.html") {
            return req.respond({ status: 200, contentType: "text/html", body: PAGE_HTML });
          }
          if (rel === "/deck.pdf") {
            return req.respond({ status: 200, contentType: "application/pdf", body: currentPdf });
          }
          if (rel === "/pdf.min.js" || rel === "/pdf.worker.min.js") {
            const body = await readFile(path.join(root, "build", rel.slice(1)));
            return req.respond({ status: 200, contentType: "application/javascript", body });
          }
          if (rel.startsWith("/standard_fonts/")) {
            const name = path.basename(rel);
            const body = await readFile(path.join(root, "standard_fonts", name));
            return req.respond({ status: 200, contentType: "application/octet-stream", body });
          }
          return req.respond({ status: 404, body: "" });
        } catch {
          return req.respond({ status: 404, body: "" });
        }
      })();
    });
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: "load" });

    const out: Buffer[][] = [];
    for (const pdf of pdfs) {
      currentPdf = pdf;
      try {
        const dataUrls = (await page.evaluate(
          `(${RENDER_ALL_PAGES})(${JSON.stringify({
            origin: ORIGIN,
            width: PREVIEW_WIDTH_PX,
            quality: JPEG_QUALITY,
          })})`,
        )) as string[];
        out.push(
          dataUrls
            .map((u) => u.replace(/^data:image\/jpeg;base64,/, ""))
            .filter(Boolean)
            .map((b64) => Buffer.from(b64, "base64")),
        );
      } catch (err) {
        console.warn(
          `[slide-preview] page render failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        out.push([]);
      }
    }
    return out;
  } catch (err) {
    console.warn(
      `[slide-preview] rasterizer unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return pdfs.map(() => []);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
