/**
 * Deterministic PNG fixtures with embedded bitmap text for OCR tests.
 * Generic — no brand / service copy. Uses pngjs only.
 */

import { PNG } from "pngjs";

/** Minimal 5×7 glyphs (rows top→bottom, bits left→right). */
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
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000],
};

function setPixel(
  png: PNG,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = 255;
}

/**
 * Render uppercase-friendly text into a high-contrast PNG Buffer.
 * Scale >= 4 recommended for tesseract reliability.
 */
export function createRenderedTextPngFixture(input: {
  readonly text: string;
  readonly scale?: number;
  readonly padding?: number;
}): Buffer {
  const scale = input.scale ?? 6;
  const padding = input.padding ?? 24;
  const lines = input.text.toUpperCase().split("\n");
  const glyphW = 5;
  const glyphH = 7;
  const gap = 1;
  const lineGap = 2;

  let maxChars = 0;
  for (const line of lines) maxChars = Math.max(maxChars, line.length);

  const contentW = maxChars * (glyphW + gap) * scale;
  const contentH =
    lines.length * glyphH * scale + (lines.length - 1) * lineGap * scale;
  const width = Math.max(32, contentW + padding * 2);
  const height = Math.max(32, contentH + padding * 2);

  const png = new PNG({ width, height });
  // White background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setPixel(png, x, y, 255, 255, 255);
    }
  }

  let cursorY = padding;
  for (const line of lines) {
    let cursorX = padding;
    for (const ch of line) {
      const glyph = GLYPHS[ch] ?? GLYPHS[" "]!;
      for (let row = 0; row < glyphH; row++) {
        const bits = glyph[row]!;
        for (let col = 0; col < glyphW; col++) {
          const on = (bits >> (glyphW - 1 - col)) & 1;
          if (!on) continue;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPixel(
                png,
                cursorX + col * scale + dx,
                cursorY + row * scale + dy,
                0,
                0,
                0,
              );
            }
          }
        }
      }
      cursorX += (glyphW + gap) * scale;
    }
    cursorY += (glyphH + lineGap) * scale;
  }

  return PNG.sync.write(png);
}

/** Blank white image — OCR should return empty / whitespace. */
export function createBlankPngFixture(size = 128): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      setPixel(png, x, y, 255, 255, 255);
    }
  }
  return PNG.sync.write(png);
}

/** Corrupt non-image bytes. */
export function createMalformedImageBytes(): Buffer {
  return Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
}
