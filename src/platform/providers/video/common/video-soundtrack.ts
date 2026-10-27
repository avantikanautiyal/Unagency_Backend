/**
 * Script-driven finishing for a stitched storyboard film: the voiceover of
 * every shot (ElevenLabs, OpenAI TTS fallback), an instrumental music bed
 * (ElevenLabs Music) ducked under the voice, and each shot's ON-SCREEN TEXT
 * drawn over its own time window. Video models produce silent clips and
 * garble lettering, so all three are added here, after the shots are joined.
 *
 * Called directly on the vendors (like direct-video-shot-planner); every part
 * is best-effort — a failed part is reported and the film keeps the rest.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoShotPlan } from "./storyboard-shot-plan";
import { renderTextCards } from "./video-text-cards";

const TTS_TIMEOUT_MS = 45_000;
const MUSIC_TIMEOUT_MS = 180_000;
/** Music bed level under the voice (before ducking). */
const MUSIC_VOLUME = 0.35;
/** A line may be sped up this much to fit its shot; beyond that it runs on. */
const MAX_VO_TEMPO = 1.25;
const VO_LEAD_IN_SEC = 0.3;
const TEXT_FADE_SEC = 0.3;

/** ElevenLabs premade voices: Rachel (default) and Adam (asked-for male / deep voices). */
const ELEVENLABS_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_MALE_VOICE = "pNInz6obpgDQGcFmaJgB";

export type SoundtrackAssets = {
  /** One entry per shot (null = silent shot or TTS failed). */
  readonly voiceovers: readonly (Buffer | null)[];
  readonly music: Buffer | null;
  readonly voiceProvider?: string;
  readonly errors: readonly string[];
};

export type SoundtrackReport = {
  readonly voiceoverShots: number;
  readonly voiceProvider?: string;
  readonly music: boolean;
  readonly textOverlays: number;
  readonly errors: readonly string[];
};

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("ffmpeg-static") as string | { path?: string } | null;
  if (typeof mod === "string" && mod.trim()) return mod;
  if (mod && typeof mod === "object" && typeof mod.path === "string") return mod.path;
  throw new Error("ffmpeg-static binary not available");
}

function runFfmpeg(args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
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
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

/** Duration of any media file ffmpeg can read. */
async function probeSec(file: string): Promise<number | null> {
  try {
    await runFfmpeg(["-i", file], 30_000);
    return null;
  } catch (err) {
    // `ffmpeg -i` with no output always exits non-zero; the header is in the message.
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(err));
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }
}

async function postForAudio(
  url: string,
  init: { headers: Record<string, string>; body: unknown },
  timeoutMs: number,
): Promise<Buffer> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...init.headers },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 256) throw new Error("empty audio");
  return bytes;
}

function elevenLabsKey(): string | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  return key && process.env.ELEVENLABS_ENABLED !== "false" ? key : null;
}

function openAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && process.env.OPENAI_ENABLED !== "false" ? key : null;
}

function wantsMaleVoice(style: string | undefined): boolean {
  return /\b(male|man|deep|baritone|masculine)\b/i.test(style ?? "") && !/\bfemale\b/i.test(style ?? "");
}

async function elevenLabsSpeech(input: {
  key: string;
  text: string;
  previousText?: string;
  nextText?: string;
  voiceStyle?: string;
}): Promise<Buffer> {
  const voice =
    process.env.VIDEO_VOICEOVER_VOICE_ID?.trim() ||
    (wantsMaleVoice(input.voiceStyle) ? ELEVENLABS_MALE_VOICE : ELEVENLABS_DEFAULT_VOICE);
  return postForAudio(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      headers: { "xi-api-key": input.key },
      body: {
        text: input.text,
        model_id: process.env.VIDEO_VOICEOVER_MODEL?.trim() || "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
        // Neighbouring lines keep one continuous delivery across separately voiced shots.
        ...(input.previousText ? { previous_text: input.previousText } : {}),
        ...(input.nextText ? { next_text: input.nextText } : {}),
      },
    },
    TTS_TIMEOUT_MS,
  );
}

async function openAiSpeech(input: { key: string; text: string; voiceStyle?: string }): Promise<Buffer> {
  return postForAudio(
    "https://api.openai.com/v1/audio/speech",
    {
      headers: { Authorization: `Bearer ${input.key}` },
      body: {
        model: process.env.VIDEO_VOICEOVER_OPENAI_MODEL?.trim() || "gpt-4o-mini-tts",
        voice: wantsMaleVoice(input.voiceStyle) ? "onyx" : "nova",
        input: input.text,
        instructions: `Professional commercial voiceover${input.voiceStyle ? `: ${input.voiceStyle}` : ", warm and confident"}.`,
        response_format: "mp3",
      },
    },
    TTS_TIMEOUT_MS,
  );
}

async function elevenLabsMusic(input: { key: string; prompt: string; totalSec: number }): Promise<Buffer> {
  return postForAudio(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
    {
      headers: { "xi-api-key": input.key },
      body: {
        prompt: input.prompt,
        // The API's accepted range is 10 s – 5 min.
        music_length_ms: Math.round(Math.min(300, Math.max(10, input.totalSec + 1)) * 1000),
        model_id: process.env.VIDEO_MUSIC_MODEL?.trim() || "music_v1",
        force_instrumental: true,
      },
    },
    MUSIC_TIMEOUT_MS,
  );
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(-400);
}

/**
 * Voice every shot's line and make the music bed, in parallel. Meant to run
 * while the shots render — none of it needs the video.
 */
export async function generateSoundtrackAssets(plan: VideoShotPlan): Promise<SoundtrackAssets> {
  const errors: string[] = [];
  const eleven = elevenLabsKey();
  const openai = openAiKey();
  const totalSec = plan.shots.reduce((sum, s) => sum + s.durationSec, 0);
  const lines = plan.shots.map((s) => s.voiceover?.trim() ?? "");
  const providers = new Set<string>();

  const voiceovers = Promise.all(
    lines.map(async (text, i) => {
      if (!text) return null;
      const previousText = lines.slice(0, i).filter(Boolean).pop();
      const nextText = lines.slice(i + 1).find(Boolean);
      if (eleven) {
        try {
          const bytes = await elevenLabsSpeech({ key: eleven, text, previousText, nextText, voiceStyle: plan.voiceStyle });
          providers.add("elevenlabs");
          return bytes;
        } catch (err) {
          errors.push(`voiceover ${i + 1} (ElevenLabs): ${errorText(err)}`);
        }
      }
      if (openai) {
        try {
          const bytes = await openAiSpeech({ key: openai, text, voiceStyle: plan.voiceStyle });
          providers.add("openai");
          return bytes;
        } catch (err) {
          errors.push(`voiceover ${i + 1} (OpenAI): ${errorText(err)}`);
        }
      }
      if (!eleven && !openai) errors.push(`voiceover ${i + 1}: no voice provider configured`);
      return null;
    }),
  );

  const music = (async (): Promise<Buffer | null> => {
    if (process.env.VIDEO_MUSIC_ENABLED === "false" || !plan.music) return null;
    if (!eleven) {
      errors.push("music: ElevenLabs not configured");
      return null;
    }
    try {
      return await elevenLabsMusic({ key: eleven, prompt: plan.music, totalSec });
    } catch (err) {
      errors.push(`music (ElevenLabs): ${errorText(err)}`);
      return null;
    }
  })();

  const [vo, bed] = await Promise.all([voiceovers, music]);
  return {
    voiceovers: vo,
    music: bed,
    ...(providers.size ? { voiceProvider: [...providers].join("+") } : {}),
    errors,
  };
}

/** Greedy word wrap; at most 3 lines (the rest is dropped with an ellipsis). */
export function wrapOverlayText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2]}…`];
  return lines;
}

type Window = { readonly startSec: number; readonly endSec: number };

/** Where shot i's voiceover / text may play: its own window, or its whole scene's. */
function spanWindow(plan: VideoShotPlan, windows: readonly Window[], i: number): Window | null {
  const own = windows[i];
  if (!own) return null;
  const span = Math.max(1, plan.shots[i]?.spanShots ?? 1);
  const last = windows[Math.min(windows.length - 1, i + span - 1)] ?? own;
  return { startSec: own.startSec, endSec: last.endSec };
}

type AudioPart = {
  readonly inputs: string[];
  readonly filters: string[];
  readonly out: string | null;
  readonly voiceoverShots: number;
  readonly music: boolean;
};

/** Music bed + voiceover lines, as ffmpeg inputs and filters starting at `firstInput`. */
async function buildAudioPart(input: {
  readonly dir: string;
  readonly plan: VideoShotPlan;
  readonly windows: readonly Window[];
  readonly assets: SoundtrackAssets;
  readonly totalSec: number;
  readonly firstInput: number;
  readonly errors: string[];
}): Promise<AudioPart> {
  const { dir, totalSec } = input;
  const inputs: string[] = [];
  const filters: string[] = [];
  let index = input.firstInput;
  let musicLabel: string | null = null;
  if (input.assets.music) {
    const musicPath = path.join(dir, "music.mp3");
    fs.writeFileSync(musicPath, input.assets.music);
    // Loop a bed shorter than the film; trimmed to the film below.
    inputs.push("-stream_loop", "-1", "-i", musicPath);
    const fadeOut = Math.max(0, totalSec - 1.5).toFixed(2);
    filters.push(
      `[${index}:a]atrim=0:${totalSec.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=0.6,afade=t=out:st=${fadeOut}:d=1.5,volume=${MUSIC_VOLUME}[music]`,
    );
    musicLabel = "[music]";
    index += 1;
  }
  const voLabels: string[] = [];
  let cursor = 0;
  for (let i = 0; i < input.assets.voiceovers.length; i++) {
    const bytes = input.assets.voiceovers[i];
    const win = spanWindow(input.plan, input.windows, i);
    if (!bytes || !win) continue;
    const file = path.join(dir, `vo_${i}.mp3`);
    fs.writeFileSync(file, bytes);
    const voSec = (await probeSec(file)) ?? 0;
    // Never talk over the previous line; fit the line to its scene when a light speed-up allows.
    const start = Math.max(win.startSec + VO_LEAD_IN_SEC, cursor);
    const room = Math.max(0.5, win.endSec - start - 0.1);
    const tempo = voSec > room ? Math.min(MAX_VO_TEMPO, voSec / room) : 1;
    if (start >= totalSec - 0.3) {
      input.errors.push(`voiceover ${i + 1}: no room left in the film`);
      continue;
    }
    inputs.push("-i", file);
    const delayMs = Math.round(start * 1000);
    filters.push(
      `[${index}:a]aresample=44100,${tempo > 1.001 ? `atempo=${tempo.toFixed(3)},` : ""}adelay=${delayMs}|${delayMs}[vo${i}]`,
    );
    voLabels.push(`[vo${i}]`);
    cursor = start + voSec / tempo + 0.15;
    index += 1;
  }
  const T = totalSec.toFixed(2);
  let out: string | null = null;
  if (voLabels.length) {
    filters.push(`${voLabels.join("")}amix=inputs=${voLabels.length}:normalize=0:duration=longest,apad,atrim=0:${T}[voice]`);
    if (musicLabel) {
      // Duck the music while the voice speaks.
      filters.push("[voice]asplit=2[voiceA][voiceB]");
      filters.push(`${musicLabel}[voiceA]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=500[ducked]`);
      filters.push("[ducked][voiceB]amix=inputs=2:normalize=0:duration=first[aout]");
    } else {
      filters.push("[voice]anull[aout]");
    }
    out = "[aout]";
  } else if (musicLabel) {
    out = musicLabel;
  }
  return { inputs, filters, out, voiceoverShots: voLabels.length, music: Boolean(musicLabel) };
}

type TextPart = { readonly inputs: string[]; readonly filters: string[]; readonly out: string | null; readonly count: number };

/** Text cards (transparent PNGs) faded in and out over their windows, starting at `firstInput`. */
function buildTextPart(input: {
  readonly dir: string;
  readonly cards: readonly (Buffer | null)[];
  readonly plan: VideoShotPlan;
  readonly windows: readonly Window[];
  readonly totalSec: number;
  readonly firstInput: number;
}): TextPart {
  const inputs: string[] = [];
  const filters: string[] = [];
  let index = input.firstInput;
  let base = "[0:v]";
  let count = 0;
  input.cards.forEach((card, i) => {
    const win = spanWindow(input.plan, input.windows, i);
    if (!card || !win) return;
    const isLast = i + Math.max(1, input.plan.shots[i]?.spanShots ?? 1) >= input.cards.length;
    const start = win.startSec + 0.4;
    const end = isLast ? input.totalSec : win.endSec - 0.2;
    const dur = end - start;
    if (dur < 0.8) return;
    const file = path.join(input.dir, `text_${i}.png`);
    fs.writeFileSync(file, card);
    inputs.push("-loop", "1", "-framerate", "25", "-t", dur.toFixed(2), "-i", file);
    const fadeOut = Math.max(0, dur - TEXT_FADE_SEC).toFixed(2);
    filters.push(
      `[${index}:v]scale=${input.plan.width}:${input.plan.height},format=rgba,fade=t=in:st=0:d=${TEXT_FADE_SEC}:alpha=1,fade=t=out:st=${fadeOut}:d=${TEXT_FADE_SEC}:alpha=1,setpts=PTS-STARTPTS+${start.toFixed(2)}/TB[card${i}]`,
      `${base}[card${i}]overlay=0:0:eof_action=pass:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[v${i}]`,
    );
    base = `[v${i}]`;
    index += 1;
    count += 1;
  });
  return { inputs, filters, out: count ? base : null, count };
}

/**
 * Overlay text and mix the soundtrack onto the stitched film. `shotWindows`
 * are each shot's [start, end) seconds on the stitched film's timeline.
 * Sound never depends on the text: if the combined pass fails, the film is
 * finished again with sound only.
 */
export async function finishFilmWithSoundtrack(input: {
  readonly video: Buffer;
  readonly plan: VideoShotPlan;
  readonly shotWindows: readonly Window[];
  readonly assets: SoundtrackAssets;
}): Promise<{ bytes: Buffer; report: SoundtrackReport }> {
  const errors = [...input.assets.errors];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unagency-finish-"));
  try {
    const videoPath = path.join(dir, "film.mp4");
    fs.writeFileSync(videoPath, input.video);
    const totalSec =
      (await probeSec(videoPath)) ?? input.shotWindows[input.shotWindows.length - 1]?.endSec ?? 0;
    const T = totalSec.toFixed(2);

    const texts = input.plan.shots.map((s) => s.onScreenText?.trim() ?? "");
    let cards: (Buffer | null)[] = texts.map(() => null);
    if (texts.some(Boolean)) {
      try {
        cards = await renderTextCards(texts, input.plan.width, input.plan.height);
      } catch (err) {
        errors.push(`on-screen text: ${errorText(err)}`);
      }
    }

    const run = async (withText: boolean) => {
      const audio = await buildAudioPart({
        dir,
        plan: input.plan,
        windows: input.shotWindows,
        assets: input.assets,
        totalSec,
        firstInput: 1,
        errors: withText ? errors : [],
      });
      const text = withText
        ? buildTextPart({
            dir,
            cards,
            plan: input.plan,
            windows: input.shotWindows,
            totalSec,
            firstInput: 1 + audio.inputs.filter((a) => a === "-i").length,
          })
        : { inputs: [], filters: [], out: null, count: 0 };
      if (!text.out && !audio.out) return null;
      const outPath = path.join(dir, withText ? "out.mp4" : "out-sound.mp4");
      const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, ...audio.inputs, ...text.inputs];
      args.push("-filter_complex", [...text.filters, ...audio.filters].join(";"));
      args.push("-map", text.out ?? "0:v");
      if (audio.out) args.push("-map", audio.out);
      if (text.out) args.push("-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p");
      else args.push("-c:v", "copy");
      if (audio.out) args.push("-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2");
      args.push("-t", T, "-movflags", "+faststart", outPath);
      await runFfmpeg(args);
      return {
        bytes: fs.readFileSync(outPath),
        report: {
          voiceoverShots: audio.voiceoverShots,
          ...(input.assets.voiceProvider && audio.voiceoverShots ? { voiceProvider: input.assets.voiceProvider } : {}),
          music: audio.music,
          textOverlays: text.count,
          errors,
        } satisfies SoundtrackReport,
      };
    };

    let finished: Awaited<ReturnType<typeof run>> = null;
    try {
      finished = await run(cards.some(Boolean));
    } catch (err) {
      errors.push(`text + sound pass: ${errorText(err)}`);
      if (cards.some(Boolean)) {
        try {
          finished = await run(false);
        } catch (err2) {
          errors.push(`sound-only pass: ${errorText(err2)}`);
        }
      }
    }
    return finished ?? { bytes: input.video, report: { voiceoverShots: 0, music: false, textOverlays: 0, errors } };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
