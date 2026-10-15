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
};

export type VideoShotPlan = {
  readonly shots: readonly VideoShot[];
  readonly width: number;
  readonly height: number;
};

/** Video model prompts stay short; MiniMax truncates around 2000 chars. */
const SHOT_PROMPT_MAX_CHARS = 1200;
const STYLE_NOTE_MAX_CHARS = 300;

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

/** Scenes with explicit timings (e.g. "### SCENE 1: TITLE (0–3 seconds)"). */
export function parseScriptScenes(script: string): ScriptScene[] {
  const lines = script.split(/\r?\n/);
  const heads: { line: number; scene: Omit<ScriptScene, "visual"> }[] = [];
  lines.forEach((line, i) => {
    const m = SCENE_HEADING.exec(line.trim());
    if (!m) return;
    const startSec = Number(m[3]);
    const endSec = Number(m[4]);
    if (!(endSec > startSec)) return;
    heads.push({
      line: i,
      scene: {
        index: Number(m[1]),
        title: cleanMarkdown(m[2] ?? ""),
        startSec,
        endSec,
      },
    });
  });
  return heads.map((h, i) => {
    const body = lines.slice(h.line + 1, heads[i + 1]?.line ?? lines.length);
    // Prefer the VISUAL block; fall back to the whole scene body.
    const visualStart = body.findIndex((l) => /^\s*\**\s*visual\s*:?\s*\**\s*:?\s*$/i.test(l) || /^\s*\**visual\**\s*:/i.test(l));
    let visualLines = body;
    if (visualStart >= 0) {
      const rest = body.slice(visualStart + 1);
      const stop = rest.findIndex((l) => /^\s*\**\s*(audio|text overlay|vo|voice ?over|sound|music)\b/i.test(l) || /^\s*---\s*$/.test(l));
      const inline = body[visualStart]!.replace(/^\s*\**\s*visual\s*\**\s*:?\s*\**/i, "");
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
    const tone = /\*\*tone:\*\*\s*(.+)/i.exec(text)?.[1];
    const treatment = /\*\*visual treatment:\*\*\s*(.+)/i.exec(text)?.[1];
    const note = [tone, treatment].filter(Boolean).map((v) => cleanMarkdown(v!)).join(". ");
    if (note) return note.slice(0, STYLE_NOTE_MAX_CHARS);
  }
  return "";
}

export function buildShotPrompt(scene: ScriptScene, styleNote: string, total: number): string {
  const head = `Shot ${scene.index} of ${total}${scene.title ? ` — ${scene.title}` : ""}.`;
  const prompt = [
    head,
    scene.visual,
    "Animate the opening frame exactly as composed: same subject, wardrobe, setting, framing and colours. Natural, smooth camera motion. No added text, captions or watermarks.",
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
function spanningCuts(img: Raster, vertical: boolean, from: number, to: number, x0: number, x1: number): number[] {
  const length = to - from;
  const minSeg = Math.max(12, Math.floor(length * 0.15));
  const raw: number[] = [];
  for (let p = from + minSeg; p < to - minSeg; p++) {
    if (edgeShare(img, vertical, p, x0, x1) > 0.8) raw.push(p);
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

/**
 * Detect picture panels on a storyboard sheet: contact sheets with gutters
 * first, then collages split by full-length separators.
 */
export function detectPanels(img: Raster): Box[] {
  const byGutters = widenNarrowPanels(img, finalizePanels(img, panelsByGutters(img)));
  if (byGutters.length >= 2) return byGutters;
  return finalizePanels(img, panelsBySeparators(img));
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
