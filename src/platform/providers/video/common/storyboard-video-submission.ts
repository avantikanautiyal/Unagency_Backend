/**
 * Prepare a video submission from the canonical request:
 *  - never send the canonical placeholder to a video vendor (vendors do not
 *    read the structured request — they only see `prompt`);
 *  - when the approved script has timed scenes, plan one shot per scene that
 *    opens on the matching approved-storyboard panel (see storyboard-shot-plan).
 */

import {
  CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER,
  flattenCanonicalModelRequestToLabeledPrompt,
  isCanonicalModelRequest,
} from "../../../ai/canonical-model-request";
import type { IBlobStorage } from "../../../persistence/interfaces/persistence";
import {
  buildMusicPrompt,
  buildShotPrompt,
  findScriptScenes,
  findScriptTone,
  findStyleNote,
  imageBytesToPng,
  panelIndexForShot,
  splitStoryboardPanels,
  voiceStyleFromAudio,
  voiceoverFromAudio,
  type ScriptScene,
  type VideoShot,
  type VideoShotPlan,
} from "./storyboard-shot-plan";
import { planDirectVideoShots } from "./direct-video-shot-planner";

const DEFAULT_FRAME_SHOT_SEC = 5;
/** Shorter shots leave the engine no room to move from one frame to the next. */
const MIN_FRAME_SHOT_SEC = 4;

type StoryboardFrameRef = {
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly scene?: number;
  readonly title?: string;
  readonly visual?: string;
};

function readFrameRefs(meta: Readonly<Record<string, unknown>>): StoryboardFrameRef[] {
  const raw = meta.cdfStoryboardFrames;
  if (!Array.isArray(raw)) return [];
  const out: StoryboardFrameRef[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    if (typeof r.artifactId !== "string" || typeof r.artifactVersion !== "number") continue;
    out.push({
      artifactId: r.artifactId,
      artifactVersion: r.artifactVersion,
      ...(typeof r.scene === "number" ? { scene: r.scene } : {}),
      ...(typeof r.title === "string" ? { title: r.title } : {}),
      ...(typeof r.visual === "string" ? { visual: r.visual } : {}),
    });
  }
  return out;
}

/** Exact approved frames (one per scene) as PNG bytes; null entries failed to load. */
async function loadApprovedFrames(
  refs: readonly StoryboardFrameRef[],
  organizationId: string,
): Promise<(Buffer | null)[]> {
  const { ensureCdfArtifactBagLoaded, refreshCdfArtifactFromMongo } = await import(
    "../../../cdf/artifacts/store"
  );
  const { resolveCanonicalArtifactVisualBytes } = await import(
    "../../../cdf/generation-context/canonical-visual-bytes"
  );
  await ensureCdfArtifactBagLoaded();
  return Promise.all(
    refs.map(async (ref) => {
      try {
        await refreshCdfArtifactFromMongo(ref.artifactId);
        const got = await resolveCanonicalArtifactVisualBytes({
          artifactId: ref.artifactId,
          artifactVersion: ref.artifactVersion,
          organizationId,
        });
        if (!got.ok || !got.resolved.providerInput.url) return null;
        const bytes = await fetchImageBytes(got.resolved.providerInput.url);
        return bytes ? await imageBytesToPng(bytes) : null;
      } catch {
        return null;
      }
    }),
  );
}

/**
 * Frame for each shot: 1:1 by order when counts match (shots are planned per
 * frame); else the frame of the same script scene. Unmatched shots open on the
 * previous shot's last frame.
 */
export function frameIndexForShot(
  scene: ScriptScene,
  shotIndex: number,
  shotCount: number,
  refs: readonly StoryboardFrameRef[],
): number {
  if (refs.length === shotCount) return shotIndex;
  const byScene = refs.findIndex((r) => r.scene === scene.index);
  if (byScene >= 0) return byScene;
  return shotIndex === 0 ? 0 : -1;
}

type SessionView = {
  readonly brief?: string;
  readonly phaseId?: string | null;
  readonly lastRefinePrompt?: string;
  readonly generatedArtifacts?: readonly {
    artifactId: string;
    version: number;
    phaseId: string;
    generationExecutionId?: string;
  }[];
  readonly approvedArtifacts?: readonly {
    artifactId: string;
    version: number;
    phaseId: string;
    generationExecutionId?: string;
  }[];
};

async function loadSessionView(meta: Readonly<Record<string, unknown>>): Promise<SessionView | null> {
  const sessionId = typeof meta.cdfSessionId === "string" ? meta.cdfSessionId.trim() : "";
  if (!sessionId) return null;
  try {
    const { ensureCdfSessionLoaded } = await import("../../../cdf/session-store");
    return ((await ensureCdfSessionLoaded(sessionId)) as SessionView | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Creation time encoded in "exec_<n>_<ms>" ids (frames are submitted in page order). */
function executionOrderKey(id: string | undefined): number {
  const m = /_(\d{10,})$/.exec(id ?? "");
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Storyboard frames bound to the CDF session, in frame order — used when the
 * client did not send cdfStoryboardFrames (its page index is in-memory only).
 */
export function storyboardFramesFromSession(session: SessionView | null): StoryboardFrameRef[] {
  if (!session) return [];
  const latest = new Map<string, { version: number; order: number }>();
  for (const a of [...(session.generatedArtifacts ?? []), ...(session.approvedArtifacts ?? [])]) {
    if (a.phaseId !== "storyboard") continue;
    const prev = latest.get(a.artifactId);
    const order = executionOrderKey(a.generationExecutionId);
    if (!prev || a.version > prev.version) {
      latest.set(a.artifactId, { version: a.version, order: Math.min(order, prev?.order ?? order) });
    }
  }
  return [...latest.entries()]
    .sort((x, y) => x[1].order - y[1].order)
    .slice(0, 12)
    .map(([artifactId, v]) => ({ artifactId, artifactVersion: v.version }));
}

/** The client's refine note for this video, when this run is a refinement of it. */
function refinementForRun(meta: Readonly<Record<string, unknown>>, session: SessionView | null): string {
  const refining =
    typeof meta.refineFromExecutionId === "string" && meta.refineFromExecutionId.trim().length > 0;
  if (!refining || !session?.lastRefinePrompt) return "";
  return session.lastRefinePrompt.trim().slice(0, 400);
}

/**
 * One shot per approved frame. Each frame takes the script scene at the same
 * relative position; the script's total length is shared across the frames.
 */
function scenesFromFrames(
  frames: readonly StoryboardFrameRef[],
  scriptScenes: readonly ScriptScene[],
): ScriptScene[] {
  const scriptTotal =
    scriptScenes.length > 0
      ? scriptScenes[scriptScenes.length - 1]!.endSec - scriptScenes[0]!.startSec
      : 0;
  const per = Math.max(
    MIN_FRAME_SHOT_SEC,
    scriptTotal > 0 ? Math.round(scriptTotal / frames.length) : DEFAULT_FRAME_SHOT_SEC,
  );
  // A script scene spread over several frames is spoken / captioned once, on its first frame.
  const voiced = new Set<number>();
  return frames.map((f, i) => {
    const byScene = f.scene != null ? scriptScenes.find((s) => s.index === f.scene) : undefined;
    const scene =
      byScene ??
      (scriptScenes.length
        ? scriptScenes[Math.min(scriptScenes.length - 1, Math.floor((i * scriptScenes.length) / frames.length))]
        : undefined);
    const firstOfScene = scene != null && !voiced.has(scene.index);
    if (scene) voiced.add(scene.index);
    return {
      index: i + 1,
      title: f.title ?? scene?.title ?? "",
      startSec: i * per,
      endSec: (i + 1) * per,
      visual: f.visual ?? scene?.visual ?? f.title ?? "",
      ...(firstOfScene && scene?.audio ? { audio: scene.audio } : {}),
      ...(firstOfScene && scene?.onScreenText ? { onScreenText: scene.onScreenText } : {}),
    };
  });
}

const FALLBACK_PROMPT_MAX_CHARS = 1800;
const MAX_DIRECT_SHOTS = 6;

/** Requested film length (seconds) for the direct path; 15 s when unset. */
function directTargetSec(meta: Readonly<Record<string, unknown>>): number {
  const raw = meta.videoTargetDurationSec ?? meta.duration;
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/s$/i, ""));
  return Number.isFinite(n) && n > 0 ? Math.min(60, n) : 15;
}
const UPSTREAM_VISUAL_RELATIONSHIP = "cdf_upstream_visual_artifact";

export type StoryboardVideoSubmission = {
  readonly prompt: string;
  /** Replaces the request's image inputs (first image = opening frame). */
  readonly assets?: readonly Record<string, unknown>[];
  readonly payload: Record<string, unknown>;
};

function isPlaceholder(prompt: string): boolean {
  const t = prompt.trim();
  return !t || t === CANONICAL_MODEL_REQUEST_PROMPT_PLACEHOLDER || t.includes("unagency:canonical_model_request");
}

function frameSize(aspectRatio: string | undefined): { width: number; height: number } {
  switch ((aspectRatio ?? "16:9").trim()) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    default:
      return { width: 1920, height: 1080 };
  }
}

async function fetchImageBytes(url: string): Promise<Buffer | null> {
  const data = /^data:[^;]+;base64,(.+)$/i.exec(url.trim());
  if (data?.[1]) return Buffer.from(data[1], "base64");
  if (!/^https?:\/\//i.test(url)) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function storyboardAsset(assets: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(assets)) return undefined;
  return assets.find(
    (a): a is Record<string, unknown> =>
      !!a &&
      typeof a === "object" &&
      (a as Record<string, unknown>).relationshipLabel === UPSTREAM_VISUAL_RELATIONSHIP &&
      typeof (a as Record<string, unknown>).url === "string",
  );
}

export async function prepareStoryboardVideoSubmission(input: {
  readonly prompt: string;
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
  readonly assets?: unknown;
  readonly aspectRatio?: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly blobStorage?: IBlobStorage;
}): Promise<StoryboardVideoSubmission | null> {
  const meta = input.metadata ?? {};
  const cmr = meta.canonicalModelRequest;
  const session = await loadSessionView(meta);
  let frameRefs = readFrameRefs(meta);
  if (frameRefs.length === 0) frameRefs = storyboardFramesFromSession(session);
  const changeRequest = refinementForRun(meta, session);
  let scenes = findScriptScenes(cmr ?? meta);
  // Approved frames drive the film: one shot per frame, so every frame appears.
  if (frameRefs.length >= 2 && scenes.length !== frameRefs.length) {
    scenes = scenesFromFrames(frameRefs, scenes);
  }

  // Direct path (no script, no frames): plan fresh shots from the client's brief.
  let freshShots = false;
  if (scenes.length < 2 && session && frameRefs.length < 2) {
    const brief = session.brief?.trim() ?? "";
    const targetSec = directTargetSec(meta);
    const shotCount = Math.min(MAX_DIRECT_SHOTS, Math.max(1, Math.round(targetSec / DEFAULT_FRAME_SHOT_SEC)));
    const planned =
      brief && shotCount >= 2
        ? await planDirectVideoShots({
            brief,
            changeRequest,
            brandName: typeof meta.brandName === "string" ? meta.brandName : undefined,
            shotCount,
            shotSec: DEFAULT_FRAME_SHOT_SEC,
            aspectRatio: input.aspectRatio,
          })
        : null;
    if (planned) {
      freshShots = true;
      scenes = planned.map((p, i) => ({
        index: i + 1,
        title: p.title,
        startSec: i * DEFAULT_FRAME_SHOT_SEC,
        endSec: (i + 1) * DEFAULT_FRAME_SHOT_SEC,
        visual: p.visual,
      }));
    } else if (brief) {
      // Planner unavailable: lead with the client's own words, not the request dump.
      return {
        prompt: [changeRequest ? `Client change request (must follow): ${changeRequest}` : "", brief]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, FALLBACK_PROMPT_MAX_CHARS),
        payload: {},
      };
    }
  }

  if (scenes.length < 2) {
    if (!isPlaceholder(input.prompt)) return null;
    if (!isCanonicalModelRequest(cmr)) return null;
    // No timed script — still give the vendor the real brief, not a marker.
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    return { prompt: flat.slice(0, FALLBACK_PROMPT_MAX_CHARS), payload: {} };
  }

  const styleGuide =
    typeof meta.cdfStoryboardStyleGuide === "string" ? meta.cdfStoryboardStyleGuide.trim() : "";
  const styleNote = [styleGuide, findStyleNote(cmr ?? meta)].filter(Boolean).join(" ").slice(0, 500);
  const size = frameSize(input.aspectRatio);
  const board = storyboardAsset(input.assets ?? meta.assets);
  let panels: Buffer[] = [];
  // Approved per-scene frames win; frames that fail to load leave their shot
  // on the previous shot's last frame. Sheet splitting is the legacy path.
  let frameMode = false;
  let loadedFrames: (Buffer | null)[] = [];
  if (frameRefs.length) {
    loadedFrames = await loadApprovedFrames(frameRefs, input.organizationId);
    frameMode = loadedFrames.some(Boolean);
  }
  if (frameMode) {
    panels = loadedFrames.map((b) => b ?? Buffer.alloc(0));
  } else if (board) {
    try {
      const bytes = await fetchImageBytes(String(board.url));
      if (bytes) panels = await splitStoryboardPanels(bytes);
    } catch (err) {
      console.warn(
        `[storyboard-video] panel split skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const panelKeys: (string | undefined)[] = [];
  for (let i = 0; i < panels.length; i++) {
    if (!input.blobStorage || panels[i]!.length === 0) {
      panelKeys.push(undefined);
      continue;
    }
    const key = `tenant/${input.organizationId}/executions/${input.executionId}/storyboard/panel-${i}.png`;
    const put = await input.blobStorage.put(key, panels[i]!, "image/png");
    panelKeys.push(put.ok ? key : undefined);
  }

  const panelFor = (scene: ScriptScene, i: number): number => {
    const idx = frameMode
      ? frameIndexForShot(scene, i, scenes.length, frameRefs)
      : panelIndexForShot(i, scenes.length, panels.length);
    return idx >= 0 && panels[idx] && panels[idx]!.length > 0 ? idx : -1;
  };
  const shots: VideoShot[] = scenes.map((scene, i) => {
    const panel = panelFor(scene, i);
    const voiceover = voiceoverFromAudio(scene.audio);
    return {
      ...(voiceover ? { voiceover } : {}),
      ...(scene.onScreenText ? { onScreenText: scene.onScreenText } : {}),
      prompt: buildShotPrompt(scene, styleNote, scenes.length, {
        changeRequest,
        isLast: i === scenes.length - 1,
        fresh: freshShots,
      }),
      ...(freshShots ? { fresh: true } : {}),
      durationSec: Math.max(1, scene.endSec - scene.startSec),
      ...(panel >= 0 && panelKeys[panel] ? { panelKey: panelKeys[panel] } : {}),
    };
  });
  // Each shot lands on the next shot's frame (end-frame-capable providers).
  for (let i = 0; i < shots.length - 1; i++) {
    const next = shots[i + 1]!.panelKey;
    if (next) shots[i] = { ...shots[i]!, endPanelKey: next };
  }
  // Choose Style preview: only the opening shot, as a single clip, no end frame.
  const previewOnly = meta.cdfVideoPreviewShotOnly === true;
  if (previewOnly) {
    shots.splice(1);
    if (shots[0]) {
      const { endPanelKey: _drop, ...first } = shots[0];
      shots[0] = first;
    }
  }
  const firstEndPanel = !previewOnly && scenes.length > 1 ? panelFor(scenes[1]!, 1) : -1;
  const totalSec = shots.reduce((sum, s) => sum + s.durationSec, 0);
  const voiceStyle = scenes.map((s) => voiceStyleFromAudio(s.audio)).find(Boolean);
  // Soundtrack (music bed, voiceover) and on-screen text are added after the shots are stitched.
  const music = buildMusicPrompt({
    scenes,
    tone: findScriptTone(cmr ?? meta),
    totalSec,
    ...(freshShots ? { fallback: `Fits this brief: ${(session?.brief ?? "").slice(0, 300)}` } : {}),
  });
  const plan: VideoShotPlan = { shots, ...size, music, ...(voiceStyle ? { voiceStyle } : {}) };
  const firstPanel = panelFor(scenes[0]!, 0);
  // An unsplit sheet must never become the opening frame: drop it, keep other inputs.
  const allAssets = input.assets ?? meta.assets;
  const withoutSheet =
    board && Array.isArray(allAssets)
      ? (allAssets.filter((a) => a !== board) as Record<string, unknown>[])
      : undefined;

  return {
    prompt: shots[0]!.prompt,
    ...(firstPanel >= 0
      ? {
          assets: [
            {
              url: `data:image/png;base64,${panels[firstPanel]!.toString("base64")}`,
              mimeType: "image/png",
              role: "subject_reference",
            },
            ...(firstEndPanel >= 0
              ? [
                  {
                    url: `data:image/png;base64,${panels[firstEndPanel]!.toString("base64")}`,
                    mimeType: "image/png",
                    role: "end_frame",
                  },
                ]
              : []),
          ],
        }
      : freshShots
        ? // Text-to-video: a logo or product still must not become the opening frame.
          { assets: [] }
        : withoutSheet
          ? { assets: withoutSheet }
          : {}),
    payload: {
      duration: shots[0]!.durationSec,
      videoTargetDurationSec: totalSec,
      videoSegmentIndex: 0,
      videoSegmentCount: shots.length,
      ...(firstPanel >= 0 && firstEndPanel >= 0 ? { videoUseEndFrame: true } : {}),
      ...(shots.length > 1 ? { videoShotPlan: plan } : {}),
    },
  };
}
