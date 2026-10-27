/**
 * On-screen text for a stitched film, drawn as full-frame transparent PNGs in
 * headless Chrome and laid over the video with ffmpeg's `overlay` filter.
 *
 * Why not ffmpeg drawtext: the production ffmpeg build has no drawtext filter
 * (exit 8 = filter not found), and that one failure dropped the music and
 * voiceover with it. Chrome already renders the decks on the same server.
 */

import * as fs from "node:fs";

/** Bold sans font, embedded so the server's installed fonts do not matter. */
function fontFaceCss(): string {
  try {
    const file = require.resolve("pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf");
    const b64 = fs.readFileSync(file).toString("base64");
    return `@font-face{font-family:"Overlay";src:url(data:font/ttf;base64,${b64}) format("truetype");font-weight:700;}`;
  } catch {
    return "";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(text: string, width: number, height: number, fontCss: string): string {
  const fontSize = Math.round(Math.min(width, height) * 0.055);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
html,body{margin:0;padding:0;background:transparent;}
.frame{position:relative;width:${width}px;height:${height}px;overflow:hidden;}
.text{position:absolute;left:50%;bottom:${Math.round(height * 0.1)}px;transform:translateX(-50%);
max-width:${Math.round(width * 0.8)}px;padding:${Math.round(fontSize * 0.3)}px ${Math.round(fontSize * 0.6)}px;
background:rgba(0,0,0,0.45);border-radius:${Math.round(fontSize * 0.2)}px;color:#fff;text-align:center;
font-family:"Overlay","Liberation Sans","DejaVu Sans",Arial,sans-serif;font-weight:700;
font-size:${fontSize}px;line-height:1.3;white-space:pre-wrap;overflow-wrap:break-word;
display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
</style></head><body><div class="frame"><div class="text">${escapeHtml(text)}</div></div></body></html>`;
}

/**
 * One transparent PNG (width × height) per non-empty text; null where the
 * text is empty. Throws only when the browser cannot start.
 */
export async function renderTextCards(
  texts: readonly string[],
  width: number,
  height: number,
): Promise<(Buffer | null)[]> {
  if (!texts.some((t) => t.trim())) return texts.map(() => null);
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    ...(process.env.PRODUCTION_PATH_PUPPITER
      ? { executablePath: process.env.PRODUCTION_PATH_PUPPITER }
      : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const fontCss = fontFaceCss();
    const out: (Buffer | null)[] = [];
    for (const text of texts) {
      if (!text.trim()) {
        out.push(null);
        continue;
      }
      await page.setContent(cardHtml(text.trim(), width, height, fontCss), { waitUntil: "load", timeout: 20_000 });
      await page.evaluate("document.fonts.ready.then(() => true)");
      out.push(Buffer.from(await page.screenshot({ type: "png", omitBackground: true })));
    }
    return out;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
