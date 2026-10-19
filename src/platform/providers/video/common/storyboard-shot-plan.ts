/**
 * Storyboard-driven video: one clip per approved script scene, each opening on
 * the matching storyboard panel, trimmed to the scene's length and stitched in
 * order. Pure helpers (no provider calls) — the async lane builds the plan, the
 * composer executes it.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type ScriptScene = {
  readonly index: number;
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly visual: string;
};

export type VideoShot = {
  readonly prompt: string;
  readonly durationSec: number;
  /** Blob storage key of the storyboard panel this shot opens on. */
  readonly panelKey?: string;
  /** Next shot's panel: providers that accept an end frame land on it, so shots flow together. */
  readonly endPanelKey?: string;
};

export type VideoShotPlan = {
  readonly shots: readonly VideoShot[];
  readonly width: number;
  readonly height: number;
};

/** Video model prompts stay short; MiniMax truncates around 2000 chars. */
const SHOT_PROMPT_MAX_CHARS = 1200;
const STYLE_NOTE_MAX_CHARS = 500;

// ── script → scenes ───────────────────────────────────────────────────────

const SCENE_HEADING =
  /^#{1,6}\s*(?:\*\*)?\s*(?:scene|shot)\s*(\d+)\s*[:.\-–—]?\s*(.*?)\s*\((\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)?\s*\)\s*(?:\*\*)?\s*$/i;

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heading without timings: "## SCENE 1: THE SIGNAL". */
const SCENE_TITLE_ONLY = /^#{1,6}\s*(?:\*\*)?\s*(?:scene|shot)\s*(\d+)\s*[:.\-–—]?\s*(.*?)\s*(?:\*\*)?\s*$/i;
/** Timing line under a heading: "**Duration:** 0:00 - 0:08 (8 seconds)" or "Duration: 0–3s". */
const DURATION_LINE =
  /^\s*(?:\*\*)?\s*(?:duration|time|timing)\s*:?\s*(?:\*\*)?\s*:?\s*(\d+(?::\d{1,2})?(?:\.\d+)?)\s*(?:s|sec|secs|seconds)?\s*[–—-]\s*(\d+(?::\d{1,2})?(?:\.\d+)?)/i;

function toSeconds(value: string): number {
  if (!value.includes(":")) return Number(value);
  const [m, sec] = value.split(":");
  return Number(m) * 60 + Number(sec);
}

/**
 * Scenes with explicit timings — in the heading ("### SCENE 1: TITLE (0–3 seconds)")
 * or on a duration line just below it ("**Duration:** 0:00 - 0:08").
 */
export function parseScriptScenes(script: string): ScriptScene[] {
  const lines = script.split(/\r?\n/);
  const heads: { line: number; scene: Omit<ScriptScene, "visual"> }[] = [];
  lines.forEach((line, i) => {
    const m = SCENE_HEADING.exec(line.trim());
    let index: number;
    let title: string;
    let startSec: number;
    let endSec: number;
    if (m) {
      index = Number(m[1]);
      title = m[2] ?? "";
      startSec = Number(m[3]);
      endSec = Number(m[4]);
    } else {
      const t = SCENE_TITLE_ONLY.exec(line.trim());
      if (!t) return;
      const timing = lines
        .slice(i + 1, i + 4)
        .map((l) => DURATION_LINE.exec(l))
        .find(Boolean);
      if (!timing) return;
      index = Number(t[1]);
      title = t[2] ?? "";
      startSec = toSeconds(timing[1]!);
      endSec = toSeconds(timing[2]!);
    }
    if (!(endSec > startSec)) return;
    heads.push({ line: i, scene: { index, title: cleanMarkdown(title), startSec, endSec } });
  });
  return heads.map((h, i) => {
    const body = lines.slice(h.line + 1, heads[i + 1]?.line ?? lines.length);
    // Prefer the VISUAL block; fall back to the whole scene body.
    const visualStart = body.findIndex((l) => /^\s*(?:#+\s*)?\**\s*visual\s*:?\s*\**\s*:?\s*$/i.test(l) || /^\s*(?:#+\s*)?\**visual\**\s*:/i.test(l));
    let visualLines = body;
    if (visualStart >= 0) {
      const rest = body.slice(visualStart + 1);
      const stop = rest.findIndex((l) => /^\s*(?:#+\s*)?\**\s*(audio|text overlay|on-screen text|animation notes|vo|voice ?over|sound|music)\b/i.test(l) || /^\s*---\s*$/.test(l));
      const inline = body[visualStart]!.replace(/^\s*(?:#+\s*)?\**\s*visual\s*\**\s*:?\s*\**/i, "");
      visualLines = [inline, ...(stop >= 0 ? rest.slice(0, stop) : rest)];
    }
    return { ...h.scene, visual: cleanMarkdown(visualLines.join(" ")) };
  });
}

/** Every string inside a value (depth-limited). */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 2000) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out, depth + 1);
  }
}

/**
 * The approved script inside the request (upstream artifact text): the string
 * with the most timed scenes. Contract-agnostic — no service/phase ids.
 */
export function findScriptScenes(source: unknown): ScriptScene[] {
  const strings: string[] = [];
  collectStrings(source, strings);
  let best: ScriptScene[] = [];
  for (const s of strings) {
    if (s.length < 80 || !/scene|shot/i.test(s)) continue;
    const candidates = [s];
    // Upstream data is sometimes JSON-serialized text.
    if (s.includes("\\n")) candidates.push(s.replace(/\\n/g, "\n"));
    for (const c of candidates) {
      const scenes = parseScriptScenes(c);
      if (scenes.length > best.length) best = scenes;
    }
  }
  return best.length >= 2 ? best : [];
}

/** Colour / tone / treatment notes from the script, kept short for every shot. */
export function findStyleNote(source: unknown): string {
  const strings: string[] = [];
  collectStrings(source, strings);
  for (const s of strings) {
    const text = s.includes("\\n") ? s.replace(/\\n/g, "\n") : s;
    const characters = /\*\*characters:\*\*\s*(.+)/i.exec(text)?.[1];
    const tone = /\*\*tone:\*\*\s*(.+)/i.exec(text)?.[1];
    const treatment = /\*\*visual treatment:\*\*\s*(.+)/i.exec(text)?.[1];
    const note = [characters, tone, treatment].filter(Boolean).map((v) => cleanMarkdown(v!)).join(". ");
    if (note) return note.slice(0, STYLE_NOTE_MAX_CHARS);
  }
  return "";
}

export function buildShotPrompt(scene: ScriptScene, styleNote: string, total: number): string {
  const head = `Shot ${scene.index} of ${total}${scene.title ? ` — ${scene.title}` : ""}.`;
  const prompt = [
    head,
    `Action and camera: ${scene.visual}`,
    "Start exactly on the opening frame and animate it as one continuous take — no cuts, no scene changes. Characters stay identical to the opening frame (design, proportions, colours, details) and move naturally; the camera moves smoothly. No added text, captions or watermarks.",
    styleNote ? `Style: ${styleNote}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return prompt.slice(0, SHOT_PROMPT_MAX_CHARS);
}

/** Map panels to shots (equal counts 1:1; otherwise evenly spread in order). */
export function panelIndexForShot(shotIndex: number, shotCount: number, panelCount: number): number {
  if (panelCount <= 0) return -1;
  if (panelCount === shotCount) return shotIndex;
  if (shotCount <= 1) return 0;
  return Math.round((shotIndex * (panelCount - 1)) / (shotCount - 1));
}

// ── storyboard image → panels ─────────────────────────────────────────────

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("ffmpeg-static") as string | { path?: string } | null;
  if (typeof mod === "string" && mod.trim()) return mod;
  if (mod && typeof mod === "object" && typeof mod.path === "string") return mod.path;
  throw new Error("ffmpeg-static binary not available");
}

/** Any image (jpeg / webp / png) → PNG bytes. */
async function toPng(bytes: Buffer): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unagency-sb-"));
  const inPath = path.join(dir, "in");
  const outPath = path.join(dir, "out.png");
  try {
    fs.writeFileSync(inPath, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath(), ["-y", "-i", inPath, "-frames:v", "1", outPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      child.stderr?.on("data", (c: Buffer) => (err += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-400)))));
    });
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

type Box = { x: number; y: number; w: number; h: number };
type Raster = { width: number; height: number; data: Uint8Array };

function runs(profile: readonly boolean[], minLen: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  profile.forEach((on, i) => {
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (i - start >= minLen) out.push([start, i]);
      start = -1;
    }
  });
  if (start >= 0 && profile.length - start >= minLen) out.push([start, profile.length]);
  return out;
}

function luminance(img: Raster, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!;
}

/** Contact sheets: picture blocks separated by background gutters. */
function panelsByGutters(img: Raster): Box[] {
  const { width: W, height: H, data } = img;
  const border: number[][] = [];
  const pick = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    border.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  };
  for (let x = 0; x < W; x += Math.max(1, Math.floor(W / 200))) {
    pick(x, 0);
    pick(x, H - 1);
  }
  for (let y = 0; y < H; y += Math.max(1, Math.floor(H / 200))) {
    pick(0, y);
    pick(W - 1, y);
  }
  const median = (k: number) =>
    border.map((c) => c[k]!).sort((a, b) => a - b)[Math.floor(border.length / 2)]!;
  const bg = [median(0), median(1), median(2)];
  const isContent = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return (
      Math.abs(data[i]! - bg[0]!) + Math.abs(data[i + 1]! - bg[1]!) + Math.abs(data[i + 2]! - bg[2]!) >
      60
    );
  };
  const step = Math.max(1, Math.floor(Math.min(W, H) / 400));
  const rowShare = (y: number) => {
    let n = 0;
    let t = 0;
    for (let x = 0; x < W; x += step) {
      t += 1;
      if (isContent(x, y)) n += 1;
    }
    return t ? n / t : 0;
  };
  const colShare = (x: number, y0: number, y1: number) => {
    let n = 0;
    let t = 0;
    for (let y = y0; y < y1; y += step) {
      t += 1;
      if (isContent(x, y)) n += 1;
    }
    return t ? n / t : 0;
  };
  const panels: Box[] = [];
  const rowBands = runs(
    Array.from({ length: H }, (_, y) => rowShare(y) > 0.08),
    Math.max(4, Math.floor(H * 0.02)),
  );
  for (const [y0, y1] of rowBands) {
    const colBands = runs(
      Array.from({ length: W }, (_, x) => colShare(x, y0, y1) > 0.08),
      Math.max(8, Math.floor(W * 0.06)),
    );
    for (const [x0, x1] of colBands) panels.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return panels;
}

/** Share of a full line along which there is a sharp brightness edge. */
function edgeShare(img: Raster, vertical: boolean, pos: number, from: number, to: number): number {
  const d = 2;
  const limit = vertical ? img.width : img.height;
  if (pos - d < 0 || pos + d >= limit) return 0;
  const step = Math.max(1, Math.floor((to - from) / 300));
  let n = 0;
  let hit = 0;
  for (let t = from; t < to; t += step) {
    const a = vertical ? luminance(img, pos - d, t) : luminance(img, t, pos - d);
    const b = vertical ? luminance(img, pos + d, t) : luminance(img, t, pos + d);
    n += 1;
    if (Math.abs(a - b) > 20) hit += 1;
  }
  return n ? hit / n : 0;
}

/** Positions of edge lines spanning nearly the whole extent, one per cluster. */
function spanningCuts(
  img: Raster,
  vertical: boolean,
  from: number,
  to: number,
  x0: number,
  x1: number,
  minShare = 0.8,
): number[] {
  const length = to - from;
  const minSeg = Math.max(12, Math.floor(length * 0.15));
  const raw: number[] = [];
  for (let p = from + minSeg; p < to - minSeg; p++) {
    if (edgeShare(img, vertical, p, x0, x1) > minShare) raw.push(p);
  }
  const cuts: number[] = [];
  let cluster: number[] = [];
  const flush = () => {
    if (!cluster.length) return;
    const c = Math.round((cluster[0]! + cluster[cluster.length - 1]!) / 2);
    if (c - (cuts[cuts.length - 1] ?? from) >= minSeg) cuts.push(c);
    cluster = [];
  };
  for (const p of raw) {
    if (cluster.length && p - cluster[cluster.length - 1]! > Math.max(4, length * 0.03)) flush();
    cluster.push(p);
  }
  flush();
  return cuts;
}

/** Collages: photos meeting edge to edge or split by thin lines. */
function panelsBySeparators(img: Raster): Box[] {
  const W = img.width;
  const H = img.height;
  const colCuts = spanningCuts(img, true, 0, W, 0, H);
  const xs = [0, ...colCuts, W];
  const panels: Box[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const rowCuts = spanningCuts(img, false, 0, H, x0, x1);
    const ys = [0, ...rowCuts, H];
    for (let j = 0; j < ys.length - 1; j++) {
      panels.push({ x: x0, y: ys[j]!, w: x1 - x0, h: ys[j + 1]! - ys[j]! });
    }
  }
  return panels.length > 1 ? panels : [];
}

/** Keep picture blocks (captions are short strips) in reading order. */
function finalizePanels(img: Raster, boxes: readonly Box[]): Box[] {
  const minSide = Math.min(img.width, img.height) * 0.12;
  const sized = boxes.filter((b) => b.w >= minSide && b.h >= minSide);
  if (sized.length === 0) return [];
  const maxH = Math.max(...sized.map((p) => p.h));
  const maxArea = Math.max(...sized.map((p) => p.w * p.h));
  const kept = sized.filter((p) => p.h >= maxH * 0.42 && p.w * p.h >= maxArea * 0.15);
  if (kept.length === 0) return [];
  const rowTol = Math.min(...kept.map((p) => p.h)) * 0.5;
  return kept.sort((a, b) => (Math.abs(a.y - b.y) > rowTol ? a.y - b.y : a.x - b.x));
}

/**
 * A light panel on a light sheet (e.g. a logo end card) is detected only as
 * its logo. Widen such panels to the row's typical width, centred.
 */
function widenNarrowPanels(img: Raster, panels: readonly Box[]): Box[] {
  if (panels.length < 2) return [...panels];
  const widths = panels.map((p) => p.w).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length / 2)]!;
  return panels.map((p) => {
    if (p.w >= typical * 0.7) return p;
    const cx = p.x + p.w / 2;
    const x = Math.max(0, Math.min(img.width - typical, Math.round(cx - typical / 2)));
    return { ...p, x, w: Math.min(typical, img.width - x) };
  });
}

/** Share of a vertical line that is a thin stroke (differs the same way from both sides). */
function verticalStrokeShare(img: Raster, x: number, y0: number, y1: number): number {
  const d = 3;
  if (x - d < 0 || x + d >= img.width) return 0;
  const step = Math.max(1, Math.floor((y1 - y0) / 300));
  let n = 0;
  let hit = 0;
  for (let y = y0; y < y1; y += step) {
    const c = luminance(img, x, y);
    const l = c - luminance(img, x - d, y);
    const r = c - luminance(img, x + d, y);
    n += 1;
    if ((l > 20 && r > 20) || (l < -20 && r < -20)) hit += 1;
  }
  return n ? hit / n : 0;
}

function horizontalStrokeShare(img: Raster, y: number, x0: number, x1: number): number {
  const d = 3;
  if (y - d < 0 || y + d >= img.height) return 0;
  const step = Math.max(1, Math.floor((x1 - x0) / 300));
  let n = 0;
  let hit = 0;
  for (let x = x0; x < x1; x += step) {
    const c = luminance(img, x, y);
    const u = c - luminance(img, x, y - d);
    const v = c - luminance(img, x, y + d);
    n += 1;
    if ((u > 20 && v > 20) || (u < -20 && v < -20)) hit += 1;
  }
  return n ? hit / n : 0;
}

/**
 * Inside of a drawn frame border around a panel, dropping captions and labels;
 * null when no frame is found. Searches a little past the box — row bands
 * often start just inside the border.
 */
function frameInside(img: Raster, box: Box): Box | null {
  const m = 12;
  const y0 = Math.max(3, box.y - m);
  const y1 = Math.min(img.height - 3, box.y + box.h + m);
  const mx0 = box.x + Math.floor(box.w * 0.25);
  const mx1 = box.x + Math.floor(box.w * 0.75);
  const ys: number[] = [];
  for (let y = y0; y < y1; y++) {
    if (horizontalStrokeShare(img, y, mx0, mx1) > 0.7) ys.push(y);
  }
  // One position per stroke cluster; the search margin can catch a neighbour's border.
  const lines: number[] = [];
  for (const y of ys) {
    if (!lines.length || y - lines[lines.length - 1]! > 6) lines.push(y);
  }
  if (lines.length < 2) return null;
  const mid = box.x + box.w / 2;
  const x0 = Math.max(3, box.x - m);
  const x1 = Math.min(img.width - 3, box.x + box.w + m);
  let best: Box | null = null;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const top = lines[i]!;
      const bottom = lines[j]!;
      if (bottom - top < box.h * 0.3) continue;
      let left = -1;
      let right = -1;
      for (let x = x0; x < x1; x++) {
        if (verticalStrokeShare(img, x, top + 4, bottom - 4) <= 0.85) continue;
        if (x < mid) left = x;
        else if (right < 0) right = x;
      }
      if (left < 0 || right < 0 || right - left < box.w * 0.4) continue;
      const pad = 4;
      const cand = { x: left + pad, y: top + pad, w: right - left - 2 * pad, h: bottom - top - 2 * pad };
      if (!best || cand.w * cand.h > best.w * best.h) best = cand;
    }
  }
  return best;
}

/**
 * Trim each panel to its frame. A panel whose frame is invisible (light art on
 * a light border) takes its row's height and column's width from framed peers.
 */
function trimToFrames(img: Raster, boxes: readonly Box[]): Box[] {
  const found = boxes.map((b) => frameInside(img, b));
  const framed = found.filter((f): f is Box => !!f);
  return boxes.map((b, i) => {
    if (found[i]) return found[i]!;
    const cy = b.y + b.h / 2;
    const cx = b.x + b.w / 2;
    const row = framed.find((f) => Math.abs(f.y + f.h / 2 - cy) < b.h * 0.35);
    const col = framed.find((f) => Math.abs(f.x + f.w / 2 - cx) < b.w * 0.35);
    if (!row || !col) return b;
    return { x: col.x, y: row.y, w: col.w, h: row.h };
  });
}

/** Frame border strokes running most of a band's height, one per panel gap. */
function frameLineCuts(img: Raster, band: Box): number[] {
  const minSeg = Math.max(12, Math.floor(band.w * 0.15));
  const raw: number[] = [];
  for (let x = band.x + minSeg; x < band.x + band.w - minSeg; x++) {
    if (verticalStrokeShare(img, x, band.y, band.y + band.h) > 0.6) raw.push(x);
  }
  const cuts: number[] = [];
  for (const x of raw) {
    if (x - (cuts[cuts.length - 1] ?? band.x) >= minSeg) cuts.push(x);
  }
  return cuts;
}

/**
 * Gutter bands on dark sheets often hold several framed panels side by side
 * (panel interiors match the background). Split a band at frame edges that
 * cover most of its height — captions under frames break full-height lines.
 */
function splitBandByFrames(img: Raster, band: Box): Box[] {
  const cuts = frameLineCuts(img, band);
  if (!cuts.length) return [band];
  const xs = [band.x, ...cuts, band.x + band.w];
  const out: Box[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    out.push({ x: xs[i]!, y: band.y, w: xs[i + 1]! - xs[i]!, h: band.h });
  }
  return out;
}

/**
 * Detect picture panels on a storyboard sheet: contact sheets with gutters
 * first (splitting framed rows on dark sheets), then collages split by
 * full-length separators.
 */
export function detectPanels(img: Raster): Box[] {
  const bands = panelsByGutters(img);
  // Full-width rows: dark panel interiors fragment gutter blocks within a row.
  const rows = new Map<string, Box>();
  for (const b of bands) {
    const k = `${b.y}:${b.h}`;
    if (!rows.has(k)) rows.set(k, { x: 0, y: b.y, w: img.width, h: b.h });
  }
  const framed = finalizePanels(img, [...rows.values()].flatMap((b) => splitBandByFrames(img, b)));
  const plain = widenNarrowPanels(img, finalizePanels(img, bands));
  const byGutters =
    framed.length > plain.length ? trimToFrames(img, framed) : plain;
  if (byGutters.length >= 2) return byGutters;
  return finalizePanels(img, panelsBySeparators(img));
}

/** Any image bytes → PNG (approved storyboard frames arrive as JPEG or PNG). */
export async function imageBytesToPng(bytes: Buffer): Promise<Buffer> {
  return toPng(bytes);
}

/** Crop each detected panel out of a storyboard sheet (PNG buffers, reading order). */
export async function splitStoryboardPanels(imageBytes: Buffer): Promise<Buffer[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require("pngjs") as typeof import("pngjs");
  const png = PNG.sync.read(await toPng(imageBytes));
  const boxes = detectPanels(png);
  // A single block means the sheet could not be separated — not usable as panels.
  if (boxes.length < 2) return [];
  return boxes.map((b) => {
    // Small inset so separator lines never bleed into the frame.
    const inset = Math.max(1, Math.floor(Math.min(b.w, b.h) * 0.01));
    const x0 = b.x + inset;
    const y0 = b.y + inset;
    const w = Math.max(1, b.w - 2 * inset);
    const h = Math.max(1, b.h - 2 * inset);
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(png, out, x0, y0, w, h, 0, 0);
    return PNG.sync.write(out);
  });
}
