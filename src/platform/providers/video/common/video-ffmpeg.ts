/**
 * Local ffmpeg helpers (ffmpeg-static) for last-frame extract + mp4 concat.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function resolveFfmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("ffmpeg-static") as string | { path?: string } | null;
  if (typeof mod === "string" && mod.trim()) return mod;
  if (mod && typeof mod === "object" && typeof mod.path === "string") return mod.path;
  throw new Error("ffmpeg-static binary not available");
}

function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpegPath();
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function extractLastFramePng(input: {
  readonly videoBytes: Buffer;
}): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unagency-vid-"));
  const videoPath = path.join(dir, "in.mp4");
  const framePath = path.join(dir, "last.png");
  try {
    fs.writeFileSync(videoPath, input.videoBytes);
    // Seek near end; -update 1 writes a single image.
    await runFfmpeg([
      "-y",
      "-sseof",
      "-0.15",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      framePath,
    ]);
    if (!fs.existsSync(framePath)) {
      // Fallback: first frame if eof seek failed on short clips
      await runFfmpeg([
        "-y",
        "-i",
        videoPath,
        "-vf",
        "select=eq(n\\,0)",
        "-frames:v",
        "1",
        framePath,
      ]);
    }
    return fs.readFileSync(framePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function concatMp4Videos(input: {
  readonly clips: readonly Buffer[];
}): Promise<Buffer> {
  if (input.clips.length === 0) {
    throw new Error("concatMp4Videos requires at least one clip");
  }
  if (input.clips.length === 1) return input.clips[0]!;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unagency-concat-"));
  const listPath = path.join(dir, "list.txt");
  const outPath = path.join(dir, "out.mp4");
  try {
    const lines: string[] = [];
    input.clips.forEach((buf, i) => {
      const p = path.join(dir, `clip_${i}.mp4`);
      fs.writeFileSync(p, buf);
      // ffmpeg concat demuxer requires escaped paths
      lines.push(`file '${p.replace(/'/g, "'\\''")}'`);
    });
    fs.writeFileSync(listPath, lines.join("\n"), "utf8");
    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
