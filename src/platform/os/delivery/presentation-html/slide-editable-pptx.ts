/**
 * Editable PPTX from model-designed HTML slides.
 *
 * Chrome has already laid every slide out, so the page itself says where
 * each piece sits. Per slide:
 *   - text blocks → native PowerPoint text boxes (font, size, weight,
 *     colour, alignment, line spacing, per-run styling);
 *   - photos / logo → native pictures (cropped like object-fit);
 *   - plain solid boxes, pills, circles and outlined cards → native shapes;
 *   - everything PowerPoint cannot draw (gradients, SVG charts, shadows,
 *     blend modes…) → one screenshot of the slide with the extracted
 *     pieces hidden, placed underneath.
 *
 * An element is only lifted out when nothing painted sits above it, so
 * stacking stays right: background image, then shapes, pictures, text.
 * A slide whose extraction fails ships as a full image instead.
 */

import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import type { Page } from "puppeteer";
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "./slide-designer";

const PX_PER_INCH = SLIDE_WIDTH_PX / 13.333;
/** Slide px → points: the 1920px canvas spans 13.333in (960pt), so 1px = 0.5pt. */
const PT_PER_PX = 72 / PX_PER_INCH;

type Rgba = { readonly hex: string; readonly alpha: number };

export type EditableTextRun = {
  readonly text: string;
  /** Line break before this run (Chrome wrapped here, or a <br>). */
  readonly breakBefore?: boolean;
  readonly font?: string;
  readonly sizePx?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly color?: Rgba;
  readonly letterSpacingPx?: number;
};

export type EditableText = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly align: "left" | "center" | "right" | "justify";
  readonly lineHeightPx: number;
  readonly lines: number;
  readonly bullet?: "disc" | "number";
  readonly bulletIndentPx?: number;
  readonly runs: readonly EditableTextRun[];
};

export type EditableImage = {
  /** data: URL. */
  readonly src: string;
  /** Visible part on the slide. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Where the whole image is drawn (object-fit applied), before clipping. */
  readonly full: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly opacity: number;
};

export type EditableShape = {
  readonly kind: "rect" | "roundRect" | "ellipse";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly radiusPx: number;
  readonly fill?: Rgba;
  readonly line?: Rgba & { readonly widthPx: number };
};

export type EditableSlideLayers = {
  /** Slide screenshot with every extracted piece hidden. */
  readonly background: Buffer;
  readonly shapes: readonly EditableShape[];
  readonly images: readonly EditableImage[];
  readonly texts: readonly EditableText[];
};

type ExtractedSlide =
  | {
      readonly ok: true;
      readonly shapes: EditableShape[];
      readonly images: EditableImage[];
      readonly texts: EditableText[];
      readonly textChars: number;
      readonly extractedChars: number;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Runs in the page (plain JS so the TS build never injects helpers). Marks
 * extracted elements with data-ex-* attributes and returns their geometry,
 * relative to each slide's top-left corner, in CSS px.
 */
const EXTRACT_LAYERS = `(function () {
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  function hex2(x) { var s = Math.max(0, Math.min(255, Math.round(x))).toString(16); return s.length < 2 ? '0' + s : s; }
  function color(c) {
    if (!c || c === 'transparent') return { hex: '000000', alpha: 0 };
    var m = /^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,\\/]\\s*([\\d.]+)(%?))?\\s*\\)$/.exec(c);
    if (m) {
      var a = m[4] === undefined ? 1 : (m[5] ? num(m[4]) / 100 : num(m[4]));
      return { hex: (hex2(num(m[1])) + hex2(num(m[2])) + hex2(num(m[3]))).toUpperCase(), alpha: a };
    }
    // oklch(), color(), color-mix()…: let the canvas resolve it.
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    return { hex: (hex2(d[0]) + hex2(d[1]) + hex2(d[2])).toUpperCase(), alpha: d[3] / 255 };
  }
  function flatTransform(t) {
    if (!t || t === 'none') return true;
    var m = /^matrix\\(([^)]+)\\)$/.exec(t);
    if (!m) return false;
    var v = m[1].split(',').map(num);
    return Math.abs(v[0] - 1) < 1e-3 && Math.abs(v[1]) < 1e-3 && Math.abs(v[2]) < 1e-3 && Math.abs(v[3] - 1) < 1e-3;
  }
  /** Effective opacity, or null when an ancestor rotates/scales/filters/blends/masks. */
  function chain(el, slide) {
    var op = 1;
    for (var n = el; n; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (!flatTransform(s.transform) || (s.rotate && s.rotate !== 'none') || (s.scale && s.scale !== 'none')) return null;
      if (s.filter !== 'none' || s.mixBlendMode !== 'normal' || s.clipPath !== 'none') return null;
      if ((s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none')) return null;
      if (s.visibility === 'hidden' || s.display === 'none') return null;
      op *= num(s.opacity);
      if (n === slide) return op > 0.01 ? op : null;
    }
    return null;
  }
  function borderPaints(s) {
    var sides = ['Top', 'Right', 'Bottom', 'Left'];
    for (var i = 0; i < 4; i++) {
      var k = sides[i];
      if (num(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none' && s['border' + k + 'Style'] !== 'hidden' &&
          color(s['border' + k + 'Color']).alpha > 0.01) return true;
    }
    return false;
  }
  function boxPaints(s) {
    if (color(s.backgroundColor).alpha > 0.01) return true;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    if (s.boxShadow && s.boxShadow !== 'none') return true;
    if (s.outlineStyle && s.outlineStyle !== 'none' && num(s.outlineWidth) > 0) return true;
    return borderPaints(s);
  }
  function pseudoContent(el, which) {
    var s = getComputedStyle(el, which);
    if (!s || s.display === 'none' || s.content === 'none' || s.content === 'normal') return null;
    return s;
  }
  function pseudoPaints(el, which) {
    var s = pseudoContent(el, which);
    if (!s) return false;
    if (boxPaints(s)) return true;
    return s.content !== '""' && s.content !== "''";
  }
  function ownText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }
  function rectOf(r, sb) { return { x: r.left - sb.left, y: r.top - sb.top, w: r.width, h: r.height }; }
  function intersect(a, b) {
    var x = Math.max(a.left, b.left), y = Math.max(a.top, b.top);
    var r = Math.min(a.right, b.right), btm = Math.min(a.bottom, b.bottom);
    return r > x && btm > y ? { left: x, top: y, right: r, bottom: btm, width: r - x, height: btm - y } : null;
  }
  function radii(s) {
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
  }
  function noRadius(s) { return radii(s).every(function (r) { return num(r) === 0; }); }
  function isInlineDisplay(d) { return d === 'inline' || d === 'contents'; }

  // ── text ──────────────────────────────────────────────────────────────
  var GENERIC = { 'sans-serif': 'Arial', 'serif': 'Georgia', 'monospace': 'Courier New', 'system-ui': 'Arial', 'cursive': 'Comic Sans MS' };
  function fontFace(f) {
    var first = (f || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    return GENERIC[first] || first || 'Arial';
  }
  function transformText(t, tt) {
    if (tt === 'uppercase') return t.toUpperCase();
    if (tt === 'lowercase') return t.toLowerCase();
    if (tt === 'capitalize') return t.replace(/(^|\\s)(\\S)/g, function (_m, a, b) { return a + b.toUpperCase(); });
    return t;
  }
  function textFillOk(s) {
    if (color(s.color).alpha <= 0.01) return false;
    if (s.webkitTextFillColor && color(s.webkitTextFillColor).alpha <= 0.01) return false;
    if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') return false;
    if (num(s.webkitTextStrokeWidth) > 0) return false;
    return true;
  }
  function runStyle(s, opacity) {
    var c = color(s.color);
    return {
      font: fontFace(s.fontFamily),
      sizePx: num(s.fontSize),
      bold: num(s.fontWeight) >= 600,
      italic: s.fontStyle === 'italic' || s.fontStyle.indexOf('oblique') === 0,
      underline: (s.textDecorationLine || '').indexOf('underline') >= 0,
      strike: (s.textDecorationLine || '').indexOf('line-through') >= 0,
      color: { hex: c.hex, alpha: c.alpha * opacity },
      letterSpacingPx: s.letterSpacing === 'normal' ? 0 : num(s.letterSpacing)
    };
  }
  /** Quoted pseudo text ("“", "—"); undefined = none; null = something we cannot copy (counter(), attr()…). */
  function pseudoText(el, which) {
    var s = pseudoContent(el, which);
    if (!s) return undefined;
    var m = /^"((?:[^"\\\\]|\\\\.)*)"$/.exec(s.content);
    if (!m) return null;
    return { text: m[1].replace(/\\\\(.)/g, '$1'), style: s };
  }
  /**
   * Runs of a block whose subtree is inline-only, with a soft break wherever
   * Chrome wrapped a line (or a <br>), so PowerPoint breaks lines in the same
   * places. Block-level ::before/::after text (a big quote mark on its own
   * line) stays in the background image and is listed in keep. Null when
   * the block holds something we cannot copy.
   */
  function collectRuns(el, opacity, lh) {
    var pieces = [];
    var keep = [];
    var failed = false;
    var lineTop = null;
    var breakNext = false;
    var styles = new Map();
    var range = document.createRange();
    function styleFor(node, pseudoStyle) {
      if (pseudoStyle) return runStyle(pseudoStyle, opacity);
      var st = styles.get(node);
      if (!st) { st = runStyle(getComputedStyle(node), opacity); styles.set(node, st); }
      return st;
    }
    function push(text, st, measured) {
      var brk = false;
      if (measured) {
        var r = measured.getClientRects()[0];
        if (r) {
          if (lineTop !== null && r.top > lineTop + lh * 0.5) brk = true;
          lineTop = r.top;
        }
      }
      if (breakNext) { brk = true; breakNext = false; }
      pieces.push({ text: text, st: st, breakBefore: brk });
    }
    function addPseudo(node, which) {
      var p = pseudoText(node, which);
      if (p === null) { failed = true; return; }
      if (!p || !p.text) return;
      if (!isInlineDisplay(p.style.display)) { keep.push({ node: node, which: which, style: p.style }); return; }
      if (!textFillOk(p.style)) { failed = true; return; }
      push(transformText(p.text, p.style.textTransform), styleFor(node, p.style), null);
    }
    function walk(node) {
      addPseudo(node, '::before');
      for (var i = 0; i < node.childNodes.length && !failed; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 3) {
          var raw = c.textContent;
          if (!raw) continue;
          var ps = getComputedStyle(c.parentElement);
          if (raw.trim() && !textFillOk(ps)) { failed = true; return; }
          var st = styleFor(c.parentElement, null);
          var re = /[ \\t\\n\\r\\f]+|[^ \\t\\n\\r\\f]+/g, m;
          while ((m = re.exec(raw))) {
            if (/^[ \\t\\n\\r\\f]/.test(m[0])) { pieces.push({ text: ' ', st: st, space: true }); continue; }
            range.setStart(c, m.index);
            range.setEnd(c, m.index + m[0].length);
            push(transformText(m[0], ps.textTransform), st, range);
          }
        } else if (c.nodeType === 1) {
          if (c.tagName === 'BR') { breakNext = true; lineTop = null; continue; }
          if (getComputedStyle(c).display === 'none') continue;
          walk(c);
        }
      }
      addPseudo(node, '::after');
    }
    walk(el);
    if (failed) return null;
    // CSS whitespace collapsing: one space between words, none at line edges.
    var out = [];
    for (var j = 0; j < pieces.length; j++) {
      var pc = pieces[j];
      if (pc.space) {
        var next = null;
        for (var k = j + 1; k < pieces.length; k++) if (!pieces[k].space) { next = pieces[k]; break; }
        var prev = out[out.length - 1];
        if (!prev || !next || next.breakBefore || / $/.test(prev.text)) continue;
        if (prev.st === pc.st) { prev.text += ' '; continue; }
        out.push({ text: ' ', st: pc.st, breakBefore: false });
        continue;
      }
      var last = out[out.length - 1];
      if (last && last.st === pc.st && !pc.breakBefore) { last.text += pc.text; continue; }
      if (last && pc.breakBefore) last.text = last.text.replace(/ +$/, '');
      out.push({ text: pc.text, st: pc.st, breakBefore: !!pc.breakBefore && out.length > 0 });
    }
    var runs = out.filter(function (r) { return r.text; }).map(function (r) {
      var o = {};
      for (var key in r.st) o[key] = r.st[key];
      o.text = r.text;
      if (r.breakBefore) o.breakBefore = true;
      return o;
    });
    if (!runs.length) return null;
    return { runs: runs, keep: keep };
  }
  /** A block whose whole subtree is inline text (the innermost text containers). */
  function isTextBlock(el) {
    var s = getComputedStyle(el);
    if (isInlineDisplay(s.display) || s.display === 'none') return false;
    if (!el.textContent.trim() && !pseudoText(el, '::before') && !pseudoText(el, '::after')) return false;
    if (['SVG', 'svg', 'IMG', 'CANVAS', 'VIDEO', 'TABLE'].indexOf(el.tagName) >= 0 || el instanceof SVGElement) return false;
    var d = el.querySelectorAll('*');
    for (var i = 0; i < d.length; i++) {
      var c = d[i];
      if (c.tagName === 'BR') continue;
      if (c instanceof SVGElement || ['IMG', 'CANVAS', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT', 'TABLE'].indexOf(c.tagName) >= 0) return false;
      var cs = getComputedStyle(c);
      if (cs.display === 'none') continue;
      if (!isInlineDisplay(cs.display)) return false;
    }
    return el.textContent.trim().length > 0 || !!pseudoText(el, '::before');
  }
  function textOf(el, slide, sb) {
    var s = getComputedStyle(el);
    if (s.writingMode !== 'horizontal-tb' || s.whiteSpace.indexOf('pre') === 0 || s.whiteSpace === 'break-spaces') return null;
    if (s.textOverflow === 'ellipsis' || num(s.textIndent) !== 0) return null;
    var opacity = chain(el, slide);
    if (opacity === null) return null;
    var fontPx = num(s.fontSize);
    var lh = s.lineHeight === 'normal' ? fontPx * 1.2 : num(s.lineHeight);
    var collected = collectRuns(el, opacity, lh);
    if (!collected) return null;
    var runs = collected.runs;
    var range = document.createRange();
    range.selectNodeContents(el);
    var rects = Array.prototype.slice.call(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; });
    if (!rects.length) return null;
    var top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    rects.forEach(function (r) {
      top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left); right = Math.max(right, r.right);
    });
    var lines = 1 + runs.filter(function (r) { return r.breakBefore; }).length;
    var br = el.getBoundingClientRect();
    var padL = num(s.paddingLeft) + num(s.borderLeftWidth);
    var padR = num(s.paddingRight) + num(s.borderRightWidth);
    var flexy = s.display.indexOf('flex') >= 0 || s.display.indexOf('grid') >= 0;
    // Wrapping width is the content box, except flex/grid text (anonymous item hugs the text).
    var x = flexy ? left : br.left + padL;
    var w = flexy ? right - left : br.width - padL - padR;
    // Top of the first line box: Chrome centres glyphs in the line (half-leading).
    var glyphH = rects[0].height;
    var y = top - Math.max(0, (lh - glyphH) / 2);
    var align = s.textAlign === 'center' ? 'center' : (s.textAlign === 'right' || s.textAlign === 'end') ? 'right' : s.textAlign === 'justify' ? 'justify' : 'left';
    var out = {
      x: x - sb.left, y: y - sb.top, w: w, h: Math.max(lines * lh, bottom - top),
      align: align, lineHeightPx: lh, lines: lines, runs: runs
    };
    if (s.display === 'list-item' && s.listStyleType !== 'none' && s.listStylePosition === 'outside') {
      out.bullet = /decimal|roman|alpha|latin|greek/.test(s.listStyleType) ? 'number' : 'disc';
      // PowerPoint draws the bullet at the box edge; Chrome hangs it ~0.9em left of the text.
      out.bulletIndentPx = fontPx * 0.9;
    }
    return { text: out, keep: collected.keep };
  }

  // ── shapes & images ───────────────────────────────────────────────────
  /** Clip rect from overflow ancestors up to the slide; null when a rounded clip would be lost. */
  function clipRect(el, slide) {
    var clip = slide.getBoundingClientRect();
    for (var n = el.parentElement; n && n !== slide; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      var r = n.getBoundingClientRect();
      if (!noRadius(s)) {
        var mine = el.getBoundingClientRect();
        var inside = mine.left >= r.left + num(s.borderTopLeftRadius) && mine.right <= r.right - num(s.borderTopRightRadius) &&
          mine.top >= r.top + num(s.borderTopLeftRadius) && mine.bottom <= r.bottom - num(s.borderBottomLeftRadius);
        if (!inside) return null;
      }
      clip = intersect(clip, r);
      if (!clip) return null;
    }
    return clip;
  }
  function shapeOf(el, slide, sb) {
    var s = getComputedStyle(el);
    if (s.backgroundImage !== 'none' || s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && num(s.outlineWidth) > 0)) return null;
    if (pseudoPaints(el, '::before') || pseudoPaints(el, '::after')) return null;
    var fill = color(s.backgroundColor);
    var bw = [num(s.borderTopWidth), num(s.borderRightWidth), num(s.borderBottomWidth), num(s.borderLeftWidth)];
    var hasBorder = borderPaints(s);
    var line = null;
    if (hasBorder) {
      var bc = [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor];
      var bs = [s.borderTopStyle, s.borderRightStyle, s.borderBottomStyle, s.borderLeftStyle];
      for (var i = 1; i < 4; i++) if (bw[i] !== bw[0] || bc[i] !== bc[0] || bs[i] !== bs[0]) return null;
      if (bs[0] !== 'solid') return null;
      line = color(bc[0]);
      line.widthPx = bw[0];
    }
    if (fill.alpha <= 0.01 && !line) return null;
    var opacity = chain(el, slide);
    if (opacity === null) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    var clip = clipRect(el, slide);
    if (!clip) return null;
    var slideBox = slide.getBoundingClientRect();
    var inner = intersect(r, slideBox);
    // Only shapes the clip leaves whole (slide edges excepted).
    var visible = intersect(r, clip);
    if (!visible || !inner || Math.abs(visible.width - inner.width) > 1 || Math.abs(visible.height - inner.height) > 1) return null;
    var rr = radii(s);
    var rad = rr.map(function (v) { return /%$/.test(v) ? num(v) / 100 * Math.min(r.width, r.height) : num(v); });
    if (rad.some(function (v) { return Math.abs(v - rad[0]) > 0.5; })) return null;
    var kind = rad[0] <= 0.5 ? 'rect' : 'roundRect';
    var radius = Math.min(rad[0], Math.min(r.width, r.height) / 2);
    if (kind === 'roundRect' && Math.abs(r.width - r.height) < 1 && radius >= r.width / 2 - 0.5) kind = 'ellipse';
    // CSS borders sit inside the box; PowerPoint strokes the outline's centre.
    var inset = line ? line.widthPx / 2 : 0;
    var out = rectOf(r, sb);
    out.x += inset; out.y += inset; out.w -= 2 * inset; out.h -= 2 * inset;
    out.kind = kind;
    out.radiusPx = Math.max(0, radius - inset);
    if (fill.alpha > 0.01) out.fill = { hex: fill.hex, alpha: fill.alpha * opacity };
    if (line) out.line = { hex: line.hex, alpha: line.alpha * opacity, widthPx: line.widthPx };
    return out;
  }
  function objectPositionPart(v, free) {
    if (/%$/.test(v)) return free * num(v) / 100;
    return num(v);
  }
  function imageOf(el, slide, sb) {
    if (!el.complete || !el.naturalWidth || !el.naturalHeight) return null;
    var src = el.currentSrc || el.src || '';
    if (src.indexOf('data:image/') !== 0 || src.indexOf('data:image/svg') === 0) return null;
    var s = getComputedStyle(el);
    if (!noRadius(s) || s.boxShadow !== 'none' || borderPaints(s) || num(s.paddingLeft) + num(s.paddingTop) + num(s.paddingRight) + num(s.paddingBottom) > 0) return null;
    if (pseudoPaints(el, '::before') || pseudoPaints(el, '::after')) return null;
    var opacity = chain(el, slide);
    if (opacity === null) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    var fit = s.objectFit || 'fill';
    var dw = r.width, dh = r.height;
    var ir = el.naturalWidth / el.naturalHeight, br = r.width / r.height;
    if (fit === 'cover') { if (br > ir) { dw = r.width; dh = r.width / ir; } else { dh = r.height; dw = r.height * ir; } }
    else if (fit === 'contain' || (fit === 'scale-down' && (el.naturalWidth > r.width || el.naturalHeight > r.height))) {
      if (br > ir) { dh = r.height; dw = r.height * ir; } else { dw = r.width; dh = r.width / ir; }
    } else if (fit === 'none' || fit === 'scale-down') { dw = el.naturalWidth; dh = el.naturalHeight; }
    var pos = (s.objectPosition || '50% 50%').split(/\\s+/);
    var dx = r.left + objectPositionPart(pos[0] || '50%', r.width - dw);
    var dy = r.top + objectPositionPart(pos[1] || '50%', r.height - dh);
    var drawn = { left: dx, top: dy, right: dx + dw, bottom: dy + dh };
    var clip = clipRect(el, slide);
    if (!clip) return null;
    // object-fit also clips to the element box.
    var visible = intersect(intersect(drawn, r) || drawn, clip);
    if (!visible) return null;
    var v = rectOf(visible, sb);
    return {
      src: src, x: v.x, y: v.y, w: v.w, h: v.h,
      full: { x: dx - sb.left, y: dy - sb.top, w: dw, h: dh },
      opacity: opacity
    };
  }

  /** Something painted sits above el somewhere over its area. */
  function occluded(el, painters) {
    var r = el.getBoundingClientRect();
    for (var i = 0; i < painters.length; i++) {
      var p = painters[i];
      if (p === el) continue;
      var ancestor = p.contains(el);
      if (ancestor && !(pseudoPaints(p, '::before') || pseudoPaints(p, '::after'))) continue;
      var inter = intersect(r, p.getBoundingClientRect());
      if (!inter || inter.width * inter.height < 4) continue;
      var pts = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
      for (var k = 0; k < pts.length; k++) {
        var px = inter.left + inter.width * pts[k][0], py = inter.top + inter.height * pts[k][1];
        if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) continue;
        var stack = document.elementsFromPoint(px, py);
        var ip = stack.indexOf(p), ie = stack.indexOf(el);
        if (ip >= 0 && ie >= 0 && ip < ie) return true;
      }
    }
    return false;
  }

  var hitStyle = document.createElement('style');
  hitStyle.textContent = '*,*::before,*::after{pointer-events:auto!important}';
  document.head.appendChild(hitStyle);
  var results = [];
  var slides = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  var freezeRules = [];
  var freezeId = 0;
  slides.forEach(function (slide, index) {
    try {
      window.scrollTo(0, 0);
      var top0 = slide.getBoundingClientRect().top;
      window.scrollTo(0, top0);
      var sb = slide.getBoundingClientRect();
      var all = Array.prototype.slice.call(slide.querySelectorAll('*'));
      var textBlocks = new Set(all.filter(isTextBlock));
      var insideText = function (el) { for (var n = el; n && n !== slide; n = n.parentElement) if (textBlocks.has(n)) return true; return false; };
      var textChars = 0;
      all.forEach(function (el) {
        for (var i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === 3) textChars += el.childNodes[i].textContent.trim().length;
        }
      });
      var painters = all.filter(function (el) {
        if (el instanceof SVGElement || ['IMG', 'CANVAS', 'VIDEO'].indexOf(el.tagName) >= 0) return true;
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        if (boxPaints(s) || pseudoPaints(el, '::before') || pseudoPaints(el, '::after')) return true;
        return ownText(el) && !insideText(el);
      });

      var texts = [], images = [], shapes = [], extractedChars = 0;
      var textEls = [], imageEls = [], shapeEls = [], keeps = [];
      textBlocks.forEach(function (el) {
        var got = textOf(el, slide, sb);
        if (!got) return;
        texts.push(got.text); textEls.push(el);
        keeps = keeps.concat(got.keep);
        extractedChars += el.textContent.trim().length;
      });
      all.forEach(function (el) {
        if (el.tagName === 'IMG') {
          var im = imageOf(el, slide, sb);
          if (im && !occluded(el, painters)) { images.push(im); imageEls.push(el); }
          return;
        }
        if (el instanceof SVGElement) return;
        var sh = shapeOf(el, slide, sb);
        if (sh && !occluded(el, painters)) { shapes.push(sh); shapeEls.push(el); }
      });
      // A text block inside a box we did NOT lift stays above it in the
      // background image; one inside a lifted shape renders above it too.
      var shapeSet = new Set(shapeEls);
      textEls.forEach(function (el) {
        el.setAttribute('data-ex-text', '');
        // currentColor borders/backgrounds must not vanish with the text colour.
        var nodes = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
        nodes.forEach(function (n) {
          var cs = getComputedStyle(n);
          // A lifted shape's own box is hidden by HIDE_EXTRACTED_CSS; inline !important would win.
          if (!shapeSet.has(n)) {
          ['Top', 'Right', 'Bottom', 'Left'].forEach(function (k) {
            n.style.setProperty('border-' + k.toLowerCase() + '-color', cs['border' + k + 'Color'], 'important');
          });
          n.style.setProperty('background-color', cs.backgroundColor, 'important');
          n.style.setProperty('outline-color', cs.outlineColor, 'important');
          }
          ['::before', '::after'].forEach(function (w) {
            var ps = pseudoContent(n, w);
            if (!ps || !boxPaints(ps)) return;
            var id = String(++freezeId);
            n.setAttribute('data-ex-freeze-' + w.slice(2), id);
            freezeRules.push('[data-ex-freeze-' + w.slice(2) + '="' + id + '"]' + w + '{background-color:' + ps.backgroundColor +
              '!important;border-color:' + ps.borderTopColor + ' ' + ps.borderRightColor + ' ' + ps.borderBottomColor + ' ' + ps.borderLeftColor + '!important}');
          });
        });
      });
      // Block-level pseudo text stays in the background, in its own colour.
      keeps.forEach(function (k) {
        var id = String(++freezeId);
        var attr = 'data-ex-keep-' + k.which.slice(2);
        k.node.setAttribute(attr, id);
        var c = k.style.color, f = k.style.webkitTextFillColor || c;
        // html body …: must outrank HIDE_EXTRACTED_CSS, which is added later.
        freezeRules.push('html body [' + attr + '="' + id + '"]' + k.which + '{color:' + c + '!important;-webkit-text-fill-color:' + f + '!important}');
      });
      imageEls.forEach(function (el) { el.setAttribute('data-ex-img', ''); });
      shapeEls.forEach(function (el) { el.setAttribute('data-ex-shape', ''); });
      results.push({ ok: true, shapes: shapes, images: images, texts: texts, textChars: textChars, extractedChars: extractedChars });
    } catch (e) {
      Array.prototype.slice.call(slide.querySelectorAll('[data-ex-text],[data-ex-img],[data-ex-shape],[data-ex-keep-before],[data-ex-keep-after]')).forEach(function (n) {
        n.removeAttribute('data-ex-text'); n.removeAttribute('data-ex-img'); n.removeAttribute('data-ex-shape');
        n.removeAttribute('data-ex-keep-before'); n.removeAttribute('data-ex-keep-after');
      });
      results.push({ ok: false, error: String(e && e.message || e) });
    }
  });
  hitStyle.remove();
  window.scrollTo(0, 0);
  var freeze = document.createElement('style');
  freeze.textContent = freezeRules.join('\\n');
  document.head.appendChild(freeze);
  return results;
})()`;

const HIDE_EXTRACTED_CSS = `
[data-ex-text],[data-ex-text] *,[data-ex-text]::before,[data-ex-text]::after,[data-ex-text] *::before,[data-ex-text] *::after,[data-ex-text]::marker,[data-ex-text] *::marker{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}
[data-ex-img]{visibility:hidden!important}
[data-ex-shape]{background-color:transparent!important;border-color:transparent!important}
`;

/**
 * Lift text, pictures and plain shapes out of the rendered slides and take
 * one background screenshot per slide without them. Call after every other
 * use of the page (it changes the page). Null entries ship as images.
 */
export async function extractEditableSlides(page: Page): Promise<(EditableSlideLayers | null)[]> {
  const extracted = (await page.evaluate(EXTRACT_LAYERS)) as ExtractedSlide[];
  await page.addStyleTag({ content: HIDE_EXTRACTED_CSS });
  const handles = await page.$$("section.slide");
  const out: (EditableSlideLayers | null)[] = [];
  for (let i = 0; i < handles.length; i++) {
    const slide = extracted[i];
    if (!slide || !slide.ok) {
      if (slide && !slide.ok) console.warn(`[presentation-html] slide ${i + 1} stays an image: ${slide.error}`);
      out.push(null);
      continue;
    }
    const background = Buffer.from(await handles[i]!.screenshot({ type: "png" }));
    out.push({ background, shapes: slide.shapes, images: slide.images, texts: slide.texts });
  }
  const summary = extracted
    .map((s, i) => (s.ok ? `${i + 1}:${s.texts.length}t/${s.images.length}i/${s.shapes.length}s ${s.textChars ? Math.round((100 * s.extractedChars) / s.textChars) : 100}%` : `${i + 1}:image`))
    .join(" ");
  console.log(`[presentation-html] editable pptx layers ${summary}`);
  return out;
}

// ── PPTX ────────────────────────────────────────────────────────────────

const inch = (px: number) => px / PX_PER_INCH;
const transparency = (alpha: number) => Math.max(0, Math.min(100, Math.round((1 - alpha) * 100)));

function dataUrlForPptx(src: string): string {
  // pptxgenjs wants "image/png;base64,…" without the data: prefix.
  return src.replace(/^data:/, "");
}

function addText(slide: PptxGenJS.Slide, t: EditableText): void {
  const runs: PptxGenJS.TextProps[] = [];
  t.runs.forEach((r) => {
    runs.push({
      text: r.text,
      options: {
        // Soft break (<a:br/>): same paragraph, so a bullet stays single.
        ...(r.breakBefore ? { softBreakBefore: true } : {}),
        ...(r.font ? { fontFace: r.font } : {}),
        ...(r.sizePx ? { fontSize: Math.round(r.sizePx * PT_PER_PX * 10) / 10 } : {}),
        bold: Boolean(r.bold),
        italic: Boolean(r.italic),
        ...(r.underline ? { underline: { style: "sng" as const } } : {}),
        ...(r.strike ? { strike: "sngStrike" as const } : {}),
        ...(r.color ? { color: r.color.hex, ...(r.color.alpha < 0.99 ? { transparency: transparency(r.color.alpha) } : {}) } : {}),
        ...(r.letterSpacingPx ? { charSpacing: Math.round(r.letterSpacingPx * PT_PER_PX * 10) / 10 } : {}),
      },
    });
  });
  if (!runs.length) return;

  const indent = t.bullet ? (t.bulletIndentPx ?? 0) : 0;
  let x = t.x - indent;
  let w = t.w + indent;
  // Lines already break where Chrome broke them; a little extra width keeps
  // PowerPoint (different font metrics) from wrapping them a second time.
  const multiLine = t.lines > 1;
  const slack = Math.max(8, w * 0.05);
  if (t.align === "center") {
    x -= slack / 2;
    w += slack;
  } else if (t.align === "right") {
    x -= slack;
    w += slack;
  } else {
    w += slack;
  }
  x = Math.max(0, x);
  w = Math.min(w, SLIDE_WIDTH_PX - x);

  slide.addText(runs, {
    x: inch(x),
    y: inch(t.y),
    w: inch(w),
    h: inch(Math.max(t.h, t.lineHeightPx)),
    margin: 0,
    valign: "top",
    align: t.align,
    lineSpacing: Math.round(t.lineHeightPx * PT_PER_PX * 10) / 10,
    paraSpaceBefore: 0,
    paraSpaceAfter: 0,
    wrap: multiLine,
    fit: "none",
    ...(t.bullet
      ? {
          bullet:
            t.bullet === "number"
              ? { type: "number" as const, indent: Math.round(indent * PT_PER_PX) }
              : { characterCode: "2022", indent: Math.round(indent * PT_PER_PX) },
        }
      : {}),
  });
}

function addShape(pptx: PptxGenJS, slide: PptxGenJS.Slide, s: EditableShape): void {
  const type =
    s.kind === "ellipse" ? pptx.ShapeType.ellipse : s.kind === "roundRect" ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  slide.addShape(type, {
    x: inch(s.x),
    y: inch(s.y),
    w: inch(s.w),
    h: inch(s.h),
    ...(s.kind === "roundRect" ? { rectRadius: inch(s.radiusPx) } : {}),
    ...(s.fill
      ? { fill: { color: s.fill.hex, ...(s.fill.alpha < 0.99 ? { transparency: transparency(s.fill.alpha) } : {}) } }
      : {}),
    ...(s.line
      ? {
          line: {
            color: s.line.hex,
            width: Math.max(0.25, s.line.widthPx * PT_PER_PX),
            ...(s.line.alpha < 0.99 ? { transparency: transparency(s.line.alpha) } : {}),
          },
        }
      : {}),
  });
}

function addImage(slide: PptxGenJS.Slide, im: EditableImage): void {
  const cropped =
    Math.abs(im.full.x - im.x) > 0.5 ||
    Math.abs(im.full.y - im.y) > 0.5 ||
    Math.abs(im.full.w - im.w) > 0.5 ||
    Math.abs(im.full.h - im.h) > 0.5;
  slide.addImage({
    data: dataUrlForPptx(im.src),
    x: inch(im.x),
    y: inch(im.y),
    // With a crop, w/h are the whole drawn image and the crop box picks the visible part.
    w: inch(cropped ? im.full.w : im.w),
    h: inch(cropped ? im.full.h : im.h),
    ...(cropped
      ? {
          sizing: {
            type: "crop" as const,
            x: inch(im.x - im.full.x),
            y: inch(im.y - im.full.y),
            w: inch(im.w),
            h: inch(im.h),
          },
        }
      : {}),
    ...(im.opacity < 0.99 ? { transparency: transparency(im.opacity) } : {}),
  });
}

/**
 * PPTX with native text, pictures and shapes over a background image per
 * slide. Slides without layers (null) are the plain slide image.
 */
export async function buildEditableDeckPptx(input: {
  readonly title: string;
  readonly author?: string;
  readonly slidePngs: readonly Buffer[];
  readonly layers: readonly (EditableSlideLayers | null)[];
  readonly notes: readonly (string | undefined)[];
}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = input.title;
  if (input.author) pptx.author = input.author;
  input.slidePngs.forEach((png, i) => {
    const slide = pptx.addSlide();
    const layers = input.layers[i];
    slide.addImage({
      data: `image/png;base64,${(layers?.background ?? png).toString("base64")}`,
      x: 0,
      y: 0,
      w: inch(SLIDE_WIDTH_PX),
      h: inch(SLIDE_HEIGHT_PX),
    });
    if (layers) {
      layers.shapes.forEach((s) => addShape(pptx, slide, s));
      layers.images.forEach((im) => addImage(slide, im));
      layers.texts.forEach((t) => addText(slide, t));
    }
    const note = input.notes[i]?.trim();
    if (note) slide.addNotes(note);
  });
  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer | Uint8Array;
  return dropStrayParagraphProps(Buffer.isBuffer(out) ? out : Buffer.from(out));
}

/**
 * pptxgenjs repeats <a:pPr> before every extra run and after every soft
 * break of a paragraph; OOXML allows one, first. PowerPoint may then offer
 * to "repair" the file, so keep only the leading one.
 */
export async function dropStrayParagraphProps(pptx: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  for (const name of slides) {
    const xml = await zip.file(name)!.async("string");
    const fixed = xml.replace(/(<\/a:r>|<a:br\/>)<a:pPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:pPr>)/g, "$1");
    if (fixed !== xml) zip.file(name, fixed);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** PRESENTATION_PPTX_MODE: "editable" (default) or "image" (one picture per slide). */
export function presentationPptxMode(): "editable" | "image" {
  return (process.env.PRESENTATION_PPTX_MODE ?? "").trim().toLowerCase() === "image" ? "image" : "editable";
}
