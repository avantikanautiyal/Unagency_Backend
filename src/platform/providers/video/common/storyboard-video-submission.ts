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
  buildShotPrompt,
  findScriptScenes,
  findStyleNote,
  imageBytesToPng,
  panelIndexForShot,
  splitStoryboardPanels,
  type ScriptScene,
  type VideoShot,
  type VideoShotPlan,
} from "./storyboard-shot-plan";

const DEFAULT_FRAME_SHOT_SEC = 5;

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
 * Frame for each shot: the frame of the same script scene; else 1:1 by order
 * when counts match. Unmatched shots open on the previous shot's last frame.
 */
export function frameIndexForShot(
  scene: ScriptScene,
  shotIndex: number,
  shotCount: number,
  refs: readonly StoryboardFrameRef[],
): number {
  const byScene = refs.findIndex((r) => r.scene === scene.index);
  if (byScene >= 0) return byScene;
  if (refs.length === shotCount) return shotIndex;
  return shotIndex === 0 ? 0 : -1;
}

const FALLBACK_PROMPT_MAX_CHARS = 1800;
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
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 864, height: 1080 };
    default:
      return { width: 1280, height: 720 };
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
  const frameRefs = readFrameRefs(meta);
  let scenes = findScriptScenes(cmr ?? meta);
  // No timed script but approved frames: one shot per frame from its planned shot.
  if (scenes.length < 2 && frameRefs.length >= 2) {
    scenes = frameRefs.map((f, i) => ({
      index: f.scene ?? i + 1,
      title: f.title ?? "",
      startSec: i * DEFAULT_FRAME_SHOT_SEC,
      endSec: (i + 1) * DEFAULT_FRAME_SHOT_SEC,
      visual: f.visual ?? f.title ?? "",
    }));
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
    return {
      prompt: buildShotPrompt(scene, styleNote, scenes.length),
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
  const plan: VideoShotPlan = { shots, ...size };
  const totalSec = shots.reduce((sum, s) => sum + s.durationSec, 0);
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
