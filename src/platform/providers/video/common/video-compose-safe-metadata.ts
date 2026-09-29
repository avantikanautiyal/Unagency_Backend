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
  return out;
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

  const target = resolveVideoTargetDurationSec(meta);
  const plan = planVideoClipSegments({
    targetDurationSec: target,
    providerMaxSec: DEFAULT_PROVIDER_CLIP_MAX_SEC,
  });
  return plan.segmentCount > 1;
}
