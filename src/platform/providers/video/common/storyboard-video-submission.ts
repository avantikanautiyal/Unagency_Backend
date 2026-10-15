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
  panelIndexForShot,
  splitStoryboardPanels,
  type VideoShot,
  type VideoShotPlan,
} from "./storyboard-shot-plan";

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
  const scenes = findScriptScenes(cmr ?? meta);

  if (scenes.length < 2) {
    if (!isPlaceholder(input.prompt)) return null;
    if (!isCanonicalModelRequest(cmr)) return null;
    // No timed script — still give the vendor the real brief, not a marker.
    const flat = flattenCanonicalModelRequestToLabeledPrompt(cmr);
    return { prompt: flat.slice(0, FALLBACK_PROMPT_MAX_CHARS), payload: {} };
  }

  const styleNote = findStyleNote(cmr ?? meta);
  const size = frameSize(input.aspectRatio);
  const board = storyboardAsset(input.assets ?? meta.assets);
  let panels: Buffer[] = [];
  if (board) {
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
    if (!input.blobStorage) {
      panelKeys.push(undefined);
      continue;
    }
    const key = `tenant/${input.organizationId}/executions/${input.executionId}/storyboard/panel-${i}.png`;
    const put = await input.blobStorage.put(key, panels[i]!, "image/png");
    panelKeys.push(put.ok ? key : undefined);
  }

  const shots: VideoShot[] = scenes.map((scene, i) => {
    const panel = panelIndexForShot(i, scenes.length, panels.length);
    return {
      prompt: buildShotPrompt(scene, styleNote, scenes.length),
      durationSec: Math.max(1, scene.endSec - scene.startSec),
      ...(panel >= 0 && panelKeys[panel] ? { panelKey: panelKeys[panel] } : {}),
    };
  });
  const plan: VideoShotPlan = { shots, ...size };
  const totalSec = shots.reduce((sum, s) => sum + s.durationSec, 0);
  const firstPanel = panelIndexForShot(0, scenes.length, panels.length);

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
          ],
        }
      : {}),
    payload: {
      duration: shots[0]!.durationSec,
      videoTargetDurationSec: totalSec,
      videoSegmentIndex: 0,
      videoSegmentCount: shots.length,
      videoShotPlan: plan,
    },
  };
}
