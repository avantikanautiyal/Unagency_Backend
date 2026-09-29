/**
 * Generic OCR benchmark PNG fixtures (Phase 14.5).
 * Extends the Phase 14 bitmap renderer with contrast / noise / scale variants.
 * No service / brand / platform-specific content.
 */

import { PNG } from "pngjs";
import {
  createBlankPngFixture,
  createMalformedImageBytes,
  createRenderedTextPngFixture,
} from "./rendered-text-png-fixtures";

export {
  createBlankPngFixture,
  createMalformedImageBytes,
  createRenderedTextPngFixture,
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

/** Deterministic PRNG for reproducible noise. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

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
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
};

export type BenchmarkPngOptions = {
  readonly text: string;
  readonly scale?: number;
  readonly padding?: number;
  /** Extra horizontal gap between glyphs (stylized tracking). */
  readonly tracking?: number;
  readonly textRgb?: readonly [number, number, number];
  readonly background?: "white" | "photo_noise" | "low_contrast_gray";
  readonly seed?: number;
};

/**
 * Render text with controllable contrast / background complexity / tracking.
 */
export function createBenchmarkPngFixture(input: BenchmarkPngOptions): Buffer {
  const scale = input.scale ?? 8;
  const padding = input.padding ?? 32;
  const tracking = input.tracking ?? 1;
  const textRgb = input.textRgb ?? ([0, 0, 0] as const);
  const background = input.background ?? "white";
  const rand = mulberry32(input.seed ?? 42);

  const lines = input.text.toUpperCase().split("\n");
  const glyphW = 5;
  const glyphH = 7;
  const gap = tracking;
  const lineGap = 3;

  let maxChars = 0;
  for (const line of lines) maxChars = Math.max(maxChars, line.length);

  const contentW = maxChars * (glyphW + gap) * scale;
  const contentH =
    lines.length * glyphH * scale + Math.max(0, lines.length - 1) * lineGap * scale;
  const width = Math.max(64, contentW + padding * 2);
  const height = Math.max(64, contentH + padding * 2);

  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (background === "white") {
        setPixel(png, x, y, 255, 255, 255);
      } else if (background === "low_contrast_gray") {
        // Near-gray field; text will be only slightly darker.
        const v = 210 + Math.floor(rand() * 20);
        setPixel(png, x, y, v, v, v);
      } else {
        // photo_noise: soft photographic-ish gradient + grain
        const gx = x / Math.max(1, width - 1);
        const gy = y / Math.max(1, height - 1);
        const base = 90 + Math.floor(80 * gx + 60 * gy);
        const grain = Math.floor((rand() - 0.5) * 50);
        const v = Math.max(0, Math.min(255, base + grain));
        const r = Math.max(0, Math.min(255, v + Math.floor(rand() * 20)));
        const g = Math.max(0, Math.min(255, v - Math.floor(rand() * 15)));
        const b = Math.max(0, Math.min(255, v + Math.floor(rand() * 25)));
        setPixel(png, x, y, r, g, b);
      }
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
              // Mild shear for "stylized" when tracking is large
              const shear =
                tracking > 2 ? Math.floor((row / glyphH) * scale * 0.4) : 0;
              setPixel(
                png,
                cursorX + col * scale + dx + shear,
                cursorY + row * scale + dy,
                textRgb[0],
                textRgb[1],
                textRgb[2],
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

export type OcrBenchmarkFixtureId =
  | "A_clear_hello_world"
  | "B_multi_block"
  | "C_text_over_photo"
  | "D_small_text"
  | "E_stylized_tracking"
  | "F_wrong_text"
  | "G_no_text"
  | "H_metadata_only_pixels_blank"
  | "I_large_headline"
  | "J_low_contrast"
  | "K_producer_malformed"
  | "L_producer_missing_asset";

export type OcrBenchmarkFixture = {
  readonly id: OcrBenchmarkFixtureId;
  readonly purpose: string;
  readonly expectedTexts: readonly string[];
  /** What is actually painted on the image (may differ from expected). */
  readonly renderedGroundTruth: string | null;
  readonly expectPresence: boolean;
  readonly expectMatch: boolean;
  readonly typographyNotes: string;
  readonly buildBytes: () => Buffer | null;
  readonly forceOutcome?: "artifact_unavailable";
  /** Metadata claim for false-positive guard cases. */
  readonly metadataClaim?: string;
};

export function buildOcrBenchmarkFixtures(): readonly OcrBenchmarkFixture[] {
  return Object.freeze([
    {
      id: "A_clear_hello_world",
      purpose: "Clear high-contrast expected text",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: "HELLO WORLD",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "large scale, white bg, black text, high contrast",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "HELLO WORLD",
          scale: 10,
          padding: 40,
          background: "white",
        }),
    },
    {
      id: "B_multi_block",
      purpose: "Headline + secondary text blocks",
      expectedTexts: Object.freeze(["PRIMARY HEADLINE", "SECONDARY LINE"]),
      renderedGroundTruth: "PRIMARY HEADLINE\nSECONDARY LINE",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "two lines, high contrast",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "PRIMARY HEADLINE\nSECONDARY LINE",
          scale: 8,
          padding: 36,
          background: "white",
        }),
    },
    {
      id: "C_text_over_photo",
      purpose: "Text over photographic/noisy background",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: "HELLO WORLD",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "noise gradient background, black text",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "HELLO WORLD",
          scale: 10,
          padding: 40,
          background: "photo_noise",
          seed: 7,
        }),
    },
    {
      id: "D_small_text",
      purpose: "Small on-canvas text",
      expectedTexts: Object.freeze(["HELLO"]),
      renderedGroundTruth: "HELLO",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "scale=2 (very small glyphs)",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "HELLO",
          scale: 2,
          padding: 16,
          background: "white",
        }),
    },
    {
      id: "E_stylized_tracking",
      purpose: "Stylized wide tracking / mild shear",
      expectedTexts: Object.freeze(["STYLED"]),
      renderedGroundTruth: "STYLED",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "tracking=4 with shear, large scale",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "STYLED",
          scale: 10,
          tracking: 4,
          padding: 48,
          background: "white",
        }),
    },
    {
      id: "F_wrong_text",
      purpose: "Wrong rendered text vs expected",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: "GOODBYE WORLD",
      expectPresence: true,
      expectMatch: false,
      typographyNotes: "clear wrong message, high contrast",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "GOODBYE WORLD",
          scale: 10,
          padding: 40,
          background: "white",
        }),
    },
    {
      id: "G_no_text",
      purpose: "Blank image — affirmative absence",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: null,
      expectPresence: false,
      expectMatch: false,
      typographyNotes: "blank white, no glyphs",
      buildBytes: () => createBlankPngFixture(160),
    },
    {
      id: "H_metadata_only_pixels_blank",
      purpose: "Metadata claims text; pixels blank",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: null,
      expectPresence: false,
      expectMatch: false,
      typographyNotes: "blank pixels; metadataClaim separate",
      metadataClaim: "HELLO WORLD",
      buildBytes: () => createBlankPngFixture(160),
    },
    {
      id: "I_large_headline",
      purpose: "Large headline",
      expectedTexts: Object.freeze(["LAUNCH"]),
      renderedGroundTruth: "LAUNCH",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "scale=14 headline",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "LAUNCH",
          scale: 14,
          padding: 48,
          background: "white",
        }),
    },
    {
      id: "J_low_contrast",
      purpose: "Low-contrast text on gray field",
      expectedTexts: Object.freeze(["HELLO"]),
      renderedGroundTruth: "HELLO",
      expectPresence: true,
      expectMatch: true,
      typographyNotes: "textRgb≈(190,190,190) on gray~210–230",
      buildBytes: () =>
        createBenchmarkPngFixture({
          text: "HELLO",
          scale: 10,
          padding: 40,
          background: "low_contrast_gray",
          textRgb: [190, 190, 190],
          seed: 99,
        }),
    },
    {
      id: "K_producer_malformed",
      purpose: "Malformed image bytes → producer error",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: null,
      expectPresence: false,
      expectMatch: false,
      typographyNotes: "non-image bytes",
      buildBytes: () => createMalformedImageBytes(),
    },
    {
      id: "L_producer_missing_asset",
      purpose: "Missing vault bytes → artifact_unavailable",
      expectedTexts: Object.freeze(["HELLO WORLD"]),
      renderedGroundTruth: null,
      expectPresence: false,
      expectMatch: false,
      typographyNotes: "resolveBytes returns undefined",
      forceOutcome: "artifact_unavailable",
      buildBytes: () => null,
    },
  ]);
}
