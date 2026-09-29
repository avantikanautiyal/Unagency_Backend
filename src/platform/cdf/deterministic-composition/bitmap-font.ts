/**
 * Deterministic bitmap typography for raster composition.
 *
 * Reuses the proven 5×7 glyph approach from OCR test fixtures (pngjs only).
 * No Sharp / node-canvas / LLM layout. Font family id: "unagency.bitmap.5x7".
 */

export const BITMAP_FONT_FAMILY = "unagency.bitmap.5x7" as const;

const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1;

/** 5×7 glyphs — uppercase, lowercase (descender-safe within 7 rows), digits, punctuation. */
const GLYPHS: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  a: [0, 0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  c: [0, 0, 0b01110, 0b10000, 0b10000, 0b10000, 0b01110],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111],
  e: [0, 0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0b01000],
  g: [0, 0, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
  j: [0b00010, 0, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0, 0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101],
  n: [0, 0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  o: [0, 0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0, 0, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0, 0, 0b01111, 0b10001, 0b01111, 0b00001, 0b00001],
  r: [0, 0, 0b10110, 0b11000, 0b10000, 0b10000, 0b10000],
  s: [0, 0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0b00110],
  u: [0, 0, 0b10001, 0b10001, 0b10001, 0b10001, 0b01111],
  v: [0, 0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0, 0, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  x: [0, 0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0, 0, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0, 0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  "-": [0, 0, 0, 0b11111, 0, 0, 0],
  "–": [0, 0, 0, 0b11111, 0, 0, 0],
  "—": [0, 0, 0, 0b11111, 0, 0, 0],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  ".": [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ",": [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ":": [0, 0b00100, 0, 0, 0b00100, 0, 0],
  "?": [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
};

function glyphFor(ch: string): number[] {
  if (GLYPHS[ch]) return GLYPHS[ch]!;
  const upper = ch.toUpperCase();
  if (GLYPHS[upper]) return GLYPHS[upper]!;
  return GLYPHS[" "]!;
}

export function cellWidthPx(scale: number): number {
  return (GLYPH_W + GAP) * scale;
}

export function lineHeightPx(scale: number, lineHeightRatio: number): number {
  return Math.ceil(GLYPH_H * scale * lineHeightRatio);
}

export function measureLineWidth(text: string, scale: number): number {
  if (!text.length) return 0;
  return text.length * cellWidthPx(scale) - GAP * scale;
}

/**
 * Deterministic word-wrap. Never truncates or paraphrases — returns null if
 * text cannot fit within maxLines at this scale.
 */
export function wrapTextDeterministic(input: {
  readonly text: string;
  readonly scale: number;
  readonly maxWidthPx: number;
  readonly maxHeightPx: number;
  readonly lineHeightRatio: number;
}): { readonly lines: string[]; readonly heightPx: number } | null {
  const words = input.text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { lines: [], heightPx: 0 };

  const lh = lineHeightPx(input.scale, input.lineHeightRatio);
  const maxLines = Math.floor(input.maxHeightPx / lh);
  if (maxLines < 1) return null;

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    // Fail if a single word exceeds max width (no silent truncation).
    if (measureLineWidth(word, input.scale) > input.maxWidthPx) return null;
    const candidate = current ? `${current} ${word}` : word;
    if (measureLineWidth(candidate, input.scale) <= input.maxWidthPx) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) return null;
    }
  }
  if (current) {
    if (lines.length >= maxLines) return null;
    lines.push(current);
  }

  const heightPx = lines.length * lh;
  if (heightPx > input.maxHeightPx) return null;
  return { lines, heightPx };
}

export function fitTextDeterministic(input: {
  readonly text: string;
  readonly maxWidthPx: number;
  readonly maxHeightPx: number;
  readonly maxFontSizePx: number;
  readonly minFontSizePx: number;
  readonly lineHeightRatio: number;
}): {
  readonly scale: number;
  readonly lines: string[];
  readonly heightPx: number;
  readonly widthPx: number;
} | null {
  const maxScale = Math.max(1, Math.floor(input.maxFontSizePx / GLYPH_H));
  const minScale = Math.max(1, Math.floor(input.minFontSizePx / GLYPH_H));

  for (let scale = maxScale; scale >= minScale; scale--) {
    const wrapped = wrapTextDeterministic({
      text: input.text,
      scale,
      maxWidthPx: input.maxWidthPx,
      maxHeightPx: input.maxHeightPx,
      lineHeightRatio: input.lineHeightRatio,
    });
    if (!wrapped) continue;
    let widthPx = 0;
    for (const line of wrapped.lines) {
      widthPx = Math.max(widthPx, measureLineWidth(line, scale));
    }
    return {
      scale,
      lines: wrapped.lines,
      heightPx: wrapped.heightPx,
      widthPx,
    };
  }
  return null;
}

export type RgbaBuffer = {
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
};

export function blitText(input: {
  readonly target: RgbaBuffer;
  readonly lines: readonly string[];
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  readonly lineHeightRatio: number;
  readonly align: "left" | "center" | "right";
  readonly boxWidth: number;
  readonly colorRgb: readonly [number, number, number];
}): void {
  const lh = lineHeightPx(input.scale, input.lineHeightRatio);
  const [r, g, b] = input.colorRgb;
  let y = input.originY;

  for (const line of input.lines) {
    const lw = measureLineWidth(line, input.scale);
    let x = input.originX;
    if (input.align === "center") {
      x = input.originX + Math.floor((input.boxWidth - lw) / 2);
    } else if (input.align === "right") {
      x = input.originX + input.boxWidth - lw;
    }

    let cursorX = x;
    for (const ch of line) {
      const glyph = glyphFor(ch);
      for (let row = 0; row < GLYPH_H; row++) {
        const bits = glyph[row]!;
        for (let col = 0; col < GLYPH_W; col++) {
          if (((bits >> (GLYPH_W - 1 - col)) & 1) === 0) continue;
          for (let dy = 0; dy < input.scale; dy++) {
            for (let dx = 0; dx < input.scale; dx++) {
              setOpaquePixel(
                input.target,
                cursorX + col * input.scale + dx,
                y + row * input.scale + dy,
                r,
                g,
                b,
              );
            }
          }
        }
      }
      cursorX += cellWidthPx(input.scale);
    }
    y += lh;
  }
}

export function setOpaquePixel(
  target: RgbaBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const idx = (target.width * y + x) << 2;
  if (a >= 255) {
    target.data[idx] = r;
    target.data[idx + 1] = g;
    target.data[idx + 2] = b;
    target.data[idx + 3] = 255;
    return;
  }
  const inv = 1 - a / 255;
  target.data[idx] = Math.round(r * (a / 255) + target.data[idx]! * inv);
  target.data[idx + 1] = Math.round(g * (a / 255) + target.data[idx + 1]! * inv);
  target.data[idx + 2] = Math.round(b * (a / 255) + target.data[idx + 2]! * inv);
  target.data[idx + 3] = 255;
}

export function fillRect(
  target: RgbaBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      setOpaquePixel(target, xx, yy, r, g, b, a);
    }
  }
}
