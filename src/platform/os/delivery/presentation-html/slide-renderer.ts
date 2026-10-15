/**
 * Paints model-designed HTML slides in headless Chrome and checks them.
 *
 * One page holds every slide; the same layout feeds the PDF (one page per
 * slide), the PNG slide images (app previews + PPTX) and the QA pass, so
 * what is checked is exactly what ships.
 */

import PptxGenJS from "pptxgenjs";
import {
  SLIDE_HEIGHT_PX,
  SLIDE_WIDTH_PX,
  type DesignedDeck,
} from "./slide-designer";

export type SlideImageAsset = {
  /** Base64 bytes, no data: prefix. */
  readonly data: string;
  readonly mimeType: string;
};

export type RenderedSlideDefect = {
  /** 0-based slide index. */
  readonly slide: number;
  readonly kind: "text_overflow" | "text_clipped" | "text_too_small" | "image_broken" | "empty_slide";
  readonly detail: string;
};

export type RenderedDeck = {
  readonly pdf: Buffer;
  /** Full-resolution PNG per slide (PPTX). */
  readonly slidePngs: readonly Buffer[];
  /** JPEG per slide (app previews). */
  readonly slideJpegs: readonly Buffer[];
  readonly defects: readonly RenderedSlideDefect[];
};

const FONT_ORIGINS = ["https://fonts.googleapis.com/", "https://fonts.gstatic.com/"];
const MIN_FONT_PX = 20;

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:#ffffff}
body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
@page{size:${SLIDE_WIDTH_PX}px ${SLIDE_HEIGHT_PX}px;margin:0}
img{display:block;max-width:none}
`;

/** Re-asserted after the theme so the canvas can never be resized. */
const CANVAS_LOCK_CSS = `
.slide{width:${SLIDE_WIDTH_PX}px!important;height:${SLIDE_HEIGHT_PX}px!important;position:relative!important;overflow:hidden!important;margin:0!important;break-after:page;page-break-after:always}
.slide:last-child{break-after:auto;page-break-after:auto}
`;

/** Strip anything executable or remote from model HTML/CSS. */
export function sanitizeSlideMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|link|meta|base)[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/@import[^;]*;/gi, "")
    .replace(/expression\s*\(/gi, "");
}

function googleFontsHref(fonts: readonly string[]): string | null {
  if (!fonts.length) return null;
  const families = fonts
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=block`;
}

function dataUrl(asset: SlideImageAsset): string {
  return `data:${asset.mimeType};base64,${asset.data}`;
}

/** Brand-tinted stand-in when a slide's photo could not be generated. */
function placeholderImage(color: string): string {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#1F2937";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.95"/><stop offset="1" stop-color="${c}" stop-opacity="0.55"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function buildDeckDocument(input: {
  readonly deck: DesignedDeck;
  readonly logo?: SlideImageAsset;
  /** 1-based slide number → photo. */
  readonly images: ReadonlyMap<number, SlideImageAsset>;
  readonly placeholderColor?: string;
}): string {
  const fontsHref = googleFontsHref(input.deck.fonts);
  const placeholder = placeholderImage(input.placeholderColor ?? "#1F2937");
  const slides = input.deck.slides
    .map((html) =>
      sanitizeSlideMarkup(html)
        .replace(/\{\{LOGO\}\}/g, input.logo ? dataUrl(input.logo) : placeholder)
        .replace(/\{\{IMAGE_(\d+)\}\}/g, (_m, n: string) => {
          const asset = input.images.get(Number(n));
          return asset ? dataUrl(asset) : placeholder;
        }),
    )
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8">
${fontsHref ? `<link rel="stylesheet" href="${fontsHref}">` : ""}
<style>${BASE_CSS}</style>
<style>${sanitizeCss(input.deck.themeCss)}</style>
<style>${CANVAS_LOCK_CSS}</style>
</head><body>${slides}</body></html>`;
}

/**
 * Runs in the page. Plain JS source so the TS build never injects helpers
 * that do not exist in the browser.
 */
const AUDIT_SLIDES = `(function (minFont) {
  var out = [];
  var slides = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  slides.forEach(function (slide, index) {
    var box = slide.getBoundingClientRect();
    var issues = [];
    var textChars = 0;
    var els = slide.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      if (el.tagName === 'IMG') {
        if (!el.complete || el.naturalWidth === 0) issues.push({ kind: 'image_broken', detail: 'an image failed to load' });
        continue;
      }
      var ownText = '';
      for (var c = 0; c < el.childNodes.length; c++) {
        var node = el.childNodes[c];
        if (node.nodeType === 3) ownText += node.textContent;
      }
      ownText = ownText.trim();
      if (!ownText) continue;
      textChars += ownText.length;
      var label = '"' + ownText.slice(0, 40) + (ownText.length > 40 ? '…' : '') + '"';
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 &&
          (r.left < box.left - 2 || r.top < box.top - 2 || r.right > box.right + 2 || r.bottom > box.bottom + 2)) {
        issues.push({ kind: 'text_overflow', detail: 'text ' + label + ' extends past the slide edge' });
      }
      if (el.scrollHeight > el.clientHeight + 3 && (style.overflowY === 'hidden' || style.overflow === 'hidden' || style.webkitLineClamp !== 'none')) {
        issues.push({ kind: 'text_clipped', detail: 'text ' + label + ' is cut off by its container' });
      }
      if (el.scrollWidth > el.clientWidth + 3 && style.overflowX === 'hidden' && style.textOverflow !== 'clip') {
        issues.push({ kind: 'text_clipped', detail: 'text ' + label + ' is cut off horizontally' });
      }
      var size = parseFloat(style.fontSize);
      if (size && size < minFont) {
        issues.push({ kind: 'text_too_small', detail: 'text ' + label + ' is ' + Math.round(size) + 'px (minimum ' + minFont + 'px)' });
      }
    }
    if (textChars === 0) issues.push({ kind: 'empty_slide', detail: 'slide has no visible text' });
    var seen = {};
    issues.forEach(function (it) {
      var key = it.kind + it.detail;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ slide: index, kind: it.kind, detail: it.detail });
    });
  });
  return { count: slides.length, defects: out };
})`;

const WAIT_FOR_ASSETS = `(async function () {
  try { await document.fonts.ready; } catch (e) {}
  var imgs = Array.prototype.slice.call(document.images);
  await Promise.all(imgs.map(function (img) {
    if (img.complete) return null;
    return new Promise(function (res) { img.onload = res; img.onerror = res; });
  }));
})()`;

async function launchBrowser(): Promise<import("puppeteer").Browser> {
  const puppeteer = (await import("puppeteer")).default;
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    ...(process.env.PRODUCTION_PATH_PUPPITER
      ? { executablePath: process.env.PRODUCTION_PATH_PUPPITER }
      : {}),
  });
}

/** Render the deck: QA, per-slide PNGs and a one-page-per-slide PDF. */
export async function renderDesignedDeck(input: {
  readonly html: string;
  readonly expectedSlides: number;
}): Promise<RenderedDeck> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank" || FONT_ORIGINS.some((o) => url.startsWith(o))) {
        void req.continue();
      } else {
        void req.abort();
      }
    });
    await page.setContent(input.html, { waitUntil: "networkidle0", timeout: 45_000 }).catch(() =>
      page.setContent(input.html, { waitUntil: "load", timeout: 30_000 }),
    );
    // JS is disabled for model markup; re-enable only for our own audit code.
    await page.setJavaScriptEnabled(true);
    await page.evaluate(WAIT_FOR_ASSETS);

    const audit = (await page.evaluate(`${AUDIT_SLIDES}(${MIN_FONT_PX})`)) as {
      count: number;
      defects: RenderedSlideDefect[];
    };
    if (audit.count !== input.expectedSlides) {
      throw new Error(`Rendered ${audit.count} slides, expected ${input.expectedSlides}`);
    }

    const handles = await page.$$("section.slide");
    const slidePngs: Buffer[] = [];
    const slideJpegs: Buffer[] = [];
    for (const handle of handles) {
      slidePngs.push(Buffer.from(await handle.screenshot({ type: "png" })));
      slideJpegs.push(Buffer.from(await handle.screenshot({ type: "jpeg", quality: 85 })));
    }

    await page.emulateMediaType("screen");
    const pdf = Buffer.from(
      await page.pdf({
        width: `${SLIDE_WIDTH_PX}px`,
        height: `${SLIDE_HEIGHT_PX}px`,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
    return { pdf, slidePngs, slideJpegs, defects: audit.defects };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** PPTX with each designed slide as a full-bleed image and its speaker notes. */
export async function buildImageDeckPptx(input: {
  readonly title: string;
  readonly author?: string;
  readonly slidePngs: readonly Buffer[];
  readonly notes: readonly (string | undefined)[];
}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = input.title;
  if (input.author) pptx.author = input.author;
  input.slidePngs.forEach((png, i) => {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/png;base64,${png.toString("base64")}`,
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    });
    const note = input.notes[i]?.trim();
    if (note) slide.addNotes(note);
  });
  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer | Uint8Array;
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
