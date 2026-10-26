/**
 * SafeMetadata fields for multi-clip video target composition.
 * Provider-agnostic — MiniMax, Luma, Pixverse, etc.
 */

import { isVideoGenerationCapability } from "../../common/resolve-execution-modality";
import {
  DEFAULT_PROVIDER_CLIP_MAX_SEC,
  DEFAULT_VIDEO_TARGET_DURATION_SEC,
  planVideoClipSegments,
} from "./video-clip-segments";

export const VIDEO_COMPOSE_SAFE_KEYS = [
  "videoTargetDurationSec",
  "videoSegmentCount",
  "videoSegmentIndex",
  "prompt",
  "videoComposed",
  "videoComposing",
  "videoComposeFailed",
  "videoComposeSegmentCount",
  "videoComposeDurationSec",
  "videoShotPlan",
] as const;

/** Persist compose plan fields from the submit payload (no secrets / assets). */
export function extractVideoComposeSafeMetadata(
  payload: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  const targetRaw = payload.videoTargetDurationSec ?? payload.duration;
  if (typeof targetRaw === "number" && Number.isFinite(targetRaw)) {
    out.videoTargetDurationSec = Math.floor(targetRaw);
  } else if (typeof targetRaw === "string" && targetRaw.trim()) {
    const n = Number(String(targetRaw).replace(/s$/i, ""));
    if (Number.isFinite(n)) out.videoTargetDurationSec = Math.floor(n);
  }
  if (typeof payload.videoSegmentCount === "number" && Number.isFinite(payload.videoSegmentCount)) {
    out.videoSegmentCount = Math.max(1, Math.trunc(payload.videoSegmentCount));
  }
  if (typeof payload.videoSegmentIndex === "number" && Number.isFinite(payload.videoSegmentIndex)) {
    out.videoSegmentIndex = Math.max(0, Math.trunc(payload.videoSegmentIndex));
  }
  if (typeof payload.prompt === "string" && payload.prompt.trim()) {
    out.prompt = payload.prompt.trim().slice(0, 4000);
  }
  const plan = readVideoShotPlan(payload);
  if (plan) out.videoShotPlan = plan;
  return out;
}

/** Shot-by-shot storyboard plan (prompts, durations, panel blob keys — no image bytes). */
export function readVideoShotPlan(
  meta: Readonly<Record<string, unknown>> | undefined,
): import("./storyboard-shot-plan").VideoShotPlan | undefined {
  const raw = meta?.videoShotPlan;
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const shots = Array.isArray(rec.shots)
    ? rec.shots
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const r = s as Record<string, unknown>;
          const prompt = typeof r.prompt === "string" ? r.prompt.slice(0, 1500) : "";
          const durationSec = Number(r.durationSec);
          if (!prompt || !Number.isFinite(durationSec) || durationSec <= 0) return null;
          return {
            prompt,
            durationSec,
            ...(typeof r.panelKey === "string" && r.panelKey ? { panelKey: r.panelKey } : {}),
            ...(typeof r.endPanelKey === "string" && r.endPanelKey ? { endPanelKey: r.endPanelKey } : {}),
            ...(r.fresh === true ? { fresh: true } : {}),
            ...(typeof r.voiceover === "string" && r.voiceover.trim()
              ? { voiceover: r.voiceover.slice(0, 400) }
              : {}),
            ...(typeof r.onScreenText === "string" && r.onScreenText.trim()
              ? { onScreenText: r.onScreenText.slice(0, 160) }
              : {}),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s != null)
        .slice(0, 12)
    : [];
  const width = Number(rec.width);
  const height = Number(rec.height);
  if (shots.length < 2 || !(width > 0) || !(height > 0)) return undefined;
  return {
    shots,
    width,
    height,
    ...(typeof rec.music === "string" && rec.music.trim() ? { music: rec.music.slice(0, 900) } : {}),
    ...(typeof rec.voiceStyle === "string" && rec.voiceStyle.trim()
      ? { voiceStyle: rec.voiceStyle.slice(0, 120) }
      : {}),
  };
}

export function resolveVideoTargetDurationSec(
  meta: Readonly<Record<string, unknown>> | undefined,
): number {
  const raw = meta?.videoTargetDurationSec ?? meta?.duration;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(String(raw).replace(/s$/i, ""));
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return DEFAULT_VIDEO_TARGET_DURATION_SEC;
}

export function isVideoTargetComposeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.UNAGENCY_VIDEO_TARGET_COMPOSE?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

/**
 * True when this completed provider op should continue+concat toward product duration.
 * Applies to every video provider (not MiniMax-only).
 */
export function shouldComposeVideoTowardTarget(input: {
  readonly capabilityId: string;
  readonly safeMetadata?: Readonly<Record<string, unknown>>;
  readonly outputMimeType?: string;
  readonly outputType?: string;
}): boolean {
  if (!isVideoTargetComposeEnabled()) return false;
  if (!isVideoGenerationCapability(input.capabilityId)) return false;
  const meta = input.safeMetadata ?? {};
  if (meta.videoComposed === true) return false;
  if (meta.videoComposing === true) return false;
  // Nested continue jobs (if ever persisted) must not recurse.
  const segmentIndex =
    typeof meta.videoSegmentIndex === "number" && Number.isFinite(meta.videoSegmentIndex)
      ? Math.trunc(meta.videoSegmentIndex)
      : 0;
  if (segmentIndex > 0) return false;

  const mime = (input.outputMimeType ?? "").toLowerCase();
  const type = (input.outputType ?? "").toLowerCase();
  const looksVideo =
    type === "video" ||
    mime.startsWith("video/") ||
    mime.includes("mp4") ||
    mime === "";
  if (!looksVideo) return false;

  if (readVideoShotPlan(meta)) return true;
  const target = resolveVideoTargetDurationSec(meta);
  const plan = planVideoClipSegments({
    targetDurationSec: target,
    providerMaxSec: DEFAULT_PROVIDER_CLIP_MAX_SEC,
  });
  return plan.segmentCount > 1;
}
