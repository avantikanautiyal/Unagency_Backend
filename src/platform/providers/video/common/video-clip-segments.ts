/**
 * Product video length vs provider clip limits.
 * Hailuo / Luma accept at most 10s per job — longer deliverables are N clips + concat.
 */

export const DEFAULT_VIDEO_TARGET_DURATION_SEC = 20;

/** MiniMax Hailuo 2.3 + Luma Ray Agents max single-clip length. */
export const DEFAULT_PROVIDER_CLIP_MAX_SEC = 10;

export type VideoClipSegmentPlan = {
  readonly targetDurationSec: number;
  readonly providerMaxSec: number;
  readonly segmentCount: number;
  readonly segmentDurationSec: number;
  readonly segments: readonly { readonly index: number; readonly durationSec: number }[];
};

/**
 * Plan equal-length provider clips that sum to (or just under) the product target.
 * Example: target 20, max 10 → two 10s segments.
 */
export function planVideoClipSegments(input: {
  readonly targetDurationSec: number;
  readonly providerMaxSec?: number;
}): VideoClipSegmentPlan {
  const providerMaxSec = Math.max(
    1,
    Math.floor(input.providerMaxSec ?? DEFAULT_PROVIDER_CLIP_MAX_SEC),
  );
  const targetDurationSec = Math.max(
    1,
    Math.floor(input.targetDurationSec || DEFAULT_VIDEO_TARGET_DURATION_SEC),
  );
  const segmentCount = Math.max(1, Math.ceil(targetDurationSec / providerMaxSec));
  const segmentDurationSec = Math.min(providerMaxSec, targetDurationSec);
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    index,
    durationSec: segmentDurationSec,
  }));
  return {
    targetDurationSec,
    providerMaxSec,
    segmentCount,
    segmentDurationSec,
    segments,
  };
}

/** Wire duration for the current segment (never above provider max). */
export function wireDurationForVideoSegment(input: {
  readonly targetDurationSec?: number;
  readonly segmentIndex?: number;
  readonly providerMaxSec?: number;
}): number {
  const plan = planVideoClipSegments({
    targetDurationSec:
      input.targetDurationSec ?? DEFAULT_VIDEO_TARGET_DURATION_SEC,
    providerMaxSec: input.providerMaxSec,
  });
  const idx =
    typeof input.segmentIndex === "number" && Number.isFinite(input.segmentIndex)
      ? Math.max(0, Math.trunc(input.segmentIndex))
      : 0;
  return plan.segments[Math.min(idx, plan.segments.length - 1)]!.durationSec;
}
