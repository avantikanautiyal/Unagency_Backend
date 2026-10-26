/**
 * After a short provider clip succeeds, generate the next segment from its last
 * frame and concat toward videoTargetDurationSec (e.g. 20s = 2×10s).
 * Provider-agnostic — works with any IAsyncProviderDispatcher (Hailuo, Luma, …).
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { Result } from "../../../core/result";
import { failure, success } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { IAsyncProviderDispatcher } from "../../async/interfaces/async-provider-dispatcher";
import type { ProviderOperationRecord } from "../../async/contracts/provider-operation";
import type { BlobAccessService } from "../../../media/blob/blob-access-service";
import type { IBlobStorage } from "../../../persistence/interfaces/persistence";
import type { IBlobMetadataRepository } from "../../../media/blob/blob-metadata-repository";
import { extractInputAssets } from "../../common/input-asset-validator";
import { resolveProviderInputImageUrl } from "../../common/resolve-provider-input-image-url";
import {
  DEFAULT_PROVIDER_CLIP_MAX_SEC,
  planVideoClipSegments,
  wireDurationForVideoSegment,
} from "./video-clip-segments";
import {
  concatMp4Videos,
  crossfadeShotClips,
  extractLastFramePng,
  normalizeShotClip,
} from "./video-ffmpeg";
import {
  readVideoShotPlan,
  resolveVideoTargetDurationSec,
  shouldComposeVideoTowardTarget,
} from "./video-compose-safe-metadata";
import {
  finishFilmWithSoundtrack,
  generateSoundtrackAssets,
  type SoundtrackAssets,
  type SoundtrackReport,
} from "./video-soundtrack";

export type VideoTargetComposeInput = {
  readonly executionId: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly prompt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly artifactStorageKey: string;
  readonly artifactId: string;
  readonly dispatcher: IAsyncProviderDispatcher;
  readonly buildRequest: (payload: Record<string, unknown>) => ProviderExecutionRequest;
  readonly blobStorage: IBlobStorage;
  readonly blobMetadata: IBlobMetadataRepository;
  readonly blobAccess?: BlobAccessService;
  readonly nowIso: () => string;
};

async function downloadBlobBytes(
  blobStorage: IBlobStorage,
  storageKey: string,
): Promise<Buffer> {
  const got = await blobStorage.get(storageKey);
  if (!got.ok || !got.value?.data) {
    throw new Error(`blob unavailable: ${storageKey}`);
  }
  return Buffer.from(got.value.data, "base64");
}

async function pollUntilTerminal(
  dispatcher: IAsyncProviderDispatcher,
  request: ProviderExecutionRequest,
  providerJobId: string,
  token: CancellationToken,
  maxMs = 12 * 60_000,
): Promise<Result<{ videoUrl: string }>> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (token.cancelled) {
      return failure(new ValidationError("video compose cancelled"));
    }
    const poll = await dispatcher.pollAsync(request, providerJobId, token);
    if (!poll.ok) {
      await sleep(3000);
      continue;
    }
    if (poll.value.status === "pending") {
      await sleep(poll.value.nextPollAfterMs ?? 5000);
      continue;
    }
    if (poll.value.status === "failed" || poll.value.status === "cancelled") {
      return failure(
        new ValidationError(
          poll.value.errorMessage || `segment failed: ${poll.value.errorCode}`,
        ),
      );
    }
    const url = poll.value.outputs?.[0]?.temporaryUrl;
    if (!url) {
      return failure(new ValidationError("segment completed without video url"));
    }
    return success({ videoUrl: url });
  }
  return failure(new ValidationError("segment poll timed out"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchUrlBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extend a completed first clip toward the product target duration.
 * Returns concatenated MP4 bytes when more segments were generated.
 */
export async function composeVideoTowardTargetDuration(
  input: VideoTargetComposeInput,
): Promise<
  Result<{
    composedBytes: Buffer;
    segmentCount: number;
    targetDurationSec: number;
    soundtrack?: SoundtrackReport;
  }>
> {
  const shotPlan = readVideoShotPlan(input.payload);
  if (shotPlan) return composeStoryboardShots(input, shotPlan);

  const targetDurationSec = resolveVideoTargetDurationSec(input.payload);
  const plan = planVideoClipSegments({
    targetDurationSec,
    providerMaxSec: DEFAULT_PROVIDER_CLIP_MAX_SEC,
  });
  if (plan.segmentCount <= 1) {
    return failure(new ValidationError("compose skipped — single segment plan"));
  }

  const token: CancellationToken = { cancelled: false, reason: undefined };
  const clips: Buffer[] = [await downloadBlobBytes(input.blobStorage, input.artifactStorageKey)];

  let previousBytes = clips[0]!;
  for (let index = 1; index < plan.segmentCount; index++) {
    const framePng = await extractLastFramePng({ videoBytes: previousBytes });
    const frameDataUrl = `data:image/png;base64,${framePng.toString("base64")}`;
    const segmentDuration = wireDurationForVideoSegment({
      targetDurationSec,
      segmentIndex: index,
    });
    const continuePrompt = `${input.prompt}\n\nContinue the same cinematic sequence seamlessly from the last frame into the next storyboard beats. Keep brand, wardrobe, lighting, and product continuity. Segment ${index + 1} of ${plan.segmentCount}.`;

    const assets = [
      {
        url: frameDataUrl,
        mimeType: "image/png",
        role: "subject_reference",
      },
    ];
    const payload: Record<string, unknown> = {
      ...input.payload,
      prompt: continuePrompt,
      duration: segmentDuration,
      videoTargetDurationSec: targetDurationSec,
      videoSegmentIndex: index,
      videoSegmentCount: plan.segmentCount,
      assets,
    };
    // Drop prior temporary URLs so only the new first-frame is used.
    delete payload.image;
    delete payload.imageUrls;

    const request = input.buildRequest(payload);
    const submit = await input.dispatcher.submitAsync(
      request,
      token,
      `${input.executionId}:seg:${index}`,
    );
    if (!submit.ok) return submit;
    const jobId = submit.value.providerJobId;
    if (!jobId) {
      return failure(new ValidationError("segment submit missing providerJobId"));
    }
    const terminal = await pollUntilTerminal(
      input.dispatcher,
      request,
      jobId,
      token,
    );
    if (!terminal.ok) return terminal;
    const nextBytes = await fetchUrlBytes(terminal.value.videoUrl);
    clips.push(nextBytes);
    previousBytes = nextBytes;
  }

  const composedBytes = await concatMp4Videos({ clips });
  return success({
    composedBytes,
    segmentCount: clips.length,
    targetDurationSec,
  });
}

/** Shots rendered at once per film (provider concurrency limits; env VIDEO_SHOT_CONCURRENCY). */
function shotConcurrency(): number {
  const n = Number(process.env.VIDEO_SHOT_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.min(12, Math.floor(n)) : 4;
}

/** Run at most `limit` tasks at a time. */
function limiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];
  return async (task) => {
    if (active >= limit) await new Promise<void>((r) => queue.push(r));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

async function optionalBlob(blobStorage: IBlobStorage, key: string | undefined): Promise<Buffer | null> {
  if (!key) return null;
  try {
    return await downloadBlobBytes(blobStorage, key);
  } catch {
    return null;
  }
}

/**
 * Storyboard shot-by-shot: the first clip (already generated from shot 1's
 * panel) plus one clip per remaining shot, each opening on its own storyboard
 * panel (or the previous shot's last frame when a panel is unavailable), each
 * trimmed to its scene length, then stitched in script order.
 *
 * Shots that open on their own panel (or are fresh text-to-video) do not need
 * the previous clip, so they render in parallel; only a shot without a panel
 * waits for its predecessor's last frame. The voiceover and music render
 * alongside, then the script's sound and on-screen text are laid over the film.
 */
async function composeStoryboardShots(
  input: VideoTargetComposeInput,
  shotPlan: import("./storyboard-shot-plan").VideoShotPlan,
): Promise<
  Result<{
    composedBytes: Buffer;
    segmentCount: number;
    targetDurationSec: number;
    soundtrack?: SoundtrackReport;
  }>
> {
  // Mutable: a failed shot stops the other shots' polling.
  const token: { cancelled: boolean; reason?: string } = { cancelled: false };
  const wantsSoundtrack =
    process.env.VIDEO_SOUNDTRACK_ENABLED !== "false" &&
    (Boolean(shotPlan.music) || shotPlan.shots.some((s) => s.voiceover || s.onScreenText));
  const soundtrackAssets = wantsSoundtrack
    ? generateSoundtrackAssets(shotPlan).catch(
        (err): SoundtrackAssets => ({
          voiceovers: [],
          music: null,
          errors: [`soundtrack: ${err instanceof Error ? err.message : String(err)}`],
        }),
      )
    : null;

  const limit = limiter(shotConcurrency());
  const rawClips: Promise<Buffer>[] = [downloadBlobBytes(input.blobStorage, input.artifactStorageKey)];
  // Paid shot clips are kept, so a retried compose never pays for them twice.
  const shotKey = (index: number) =>
    `tenant/${input.organizationId}/executions/${input.executionId}/storyboard/shot-${index}.mp4`;
  const renderShot = async (index: number): Promise<Buffer> => {
    const saved = await optionalBlob(input.blobStorage, shotKey(index));
    if (saved && saved.length > 1024) return saved;
    const shot = shotPlan.shots[index]!;
    let frame = await optionalBlob(input.blobStorage, shot.panelKey);
    // Wait for the previous clip only when this shot has nothing else to open on.
    if (!frame && !shot.fresh) frame = await extractLastFramePng({ videoBytes: await rawClips[index - 1]! });
    const endFrame = await optionalBlob(input.blobStorage, shot.endPanelKey);
    return limit(async () => {
      const payload: Record<string, unknown> = {
        ...input.payload,
        prompt: shot.prompt,
        duration: shot.durationSec,
        videoSegmentIndex: index,
        videoSegmentCount: shotPlan.shots.length,
        videoUseEndFrame: Boolean(frame && endFrame),
        assets: [
          ...(frame
            ? [
                {
                  url: `data:image/png;base64,${frame.toString("base64")}`,
                  mimeType: "image/png",
                  role: "subject_reference",
                },
              ]
            : []),
          ...(frame && endFrame
            ? [
                {
                  url: `data:image/png;base64,${endFrame.toString("base64")}`,
                  mimeType: "image/png",
                  role: "end_frame",
                },
              ]
            : []),
        ],
      };
      delete payload.image;
      delete payload.imageUrls;
      delete payload.videoShotPlan;

      const request = input.buildRequest(payload);
      const submit = await input.dispatcher.submitAsync(
        request,
        token,
        `${input.executionId}:shot:${index}`,
      );
      if (!submit.ok) throw submit.error;
      const jobId = submit.value.providerJobId;
      if (!jobId) throw new ValidationError("shot submit missing providerJobId");
      const terminal = await pollUntilTerminal(input.dispatcher, request, jobId, token);
      if (!terminal.ok) throw terminal.error;
      const bytes = await fetchUrlBytes(terminal.value.videoUrl);
      await input.blobStorage.put(shotKey(index), bytes, "video/mp4").catch(() => undefined);
      return bytes;
    });
  };
  for (let index = 1; index < shotPlan.shots.length; index++) rawClips.push(renderShot(index));

  // Providers often return shorter clips than asked (Luma: ~5 s for a 6 s
  // shot). Crossfade offsets must use the real length — an offset past the
  // end of a clip makes xfade end the film there, dropping every later shot.
  // Re-encoding is CPU-heavy: one clip at a time (parallel 1080p encodes timed
  // out on the server), each as soon as it arrives while later shots render.
  const encode = limiter(1);
  const normalized = rawClips.map(async (rawClip, i) => {
    const bytes = await rawClip;
    return encode(async () => {
    const clip = await normalizeShotClip({
      bytes,
      durationSec: shotPlan.shots[i]!.durationSec,
      width: shotPlan.width,
      height: shotPlan.height,
    });
    const probed = await probeMp4DurationSec(clip);
    const sec =
      probed && probed > 0 ? Math.min(probed, shotPlan.shots[i]!.durationSec) : shotPlan.shots[i]!.durationSec;
    return { clip, sec };
    });
  });
  let settled: { clip: Buffer; sec: number }[];
  try {
    settled = await Promise.all(normalized);
  } catch (err) {
    token.cancelled = true;
    return failure(new ValidationError(err instanceof Error ? err.message : String(err)));
  }
  const clips = settled.map((s) => s.clip);
  const actualSec = settled.map((s) => s.sec);

  const fadeSec = 0.3;
  let crossfaded = true;
  let composedBytes: Buffer;
  try {
    composedBytes = await crossfadeShotClips({ clips, durationsSec: actualSec, fadeSec });
  } catch (err) {
    console.warn(
      `[storyboard-video] crossfade join failed, using plain join: ${err instanceof Error ? err.message : String(err)}`,
    );
    composedBytes = await concatMp4Videos({ clips });
    crossfaded = false;
  }
  // Never ship a silently truncated film: well short of the shots' total ⇒ plain join.
  const expectedSec = actualSec.reduce((sum, s) => sum + s, 0);
  const composedSec = await probeMp4DurationSec(composedBytes);
  if (crossfaded && composedSec != null && clips.length > 1 && composedSec < expectedSec * 0.8) {
    console.warn(
      `[storyboard-video] crossfade output ${composedSec.toFixed(1)}s < expected ${expectedSec.toFixed(1)}s, using plain join`,
    );
    composedBytes = await concatMp4Videos({ clips });
    crossfaded = false;
  }

  let soundtrack: SoundtrackReport | undefined;
  if (soundtrackAssets) {
    // Each crossfade overlaps the next shot by fadeSec.
    let at = 0;
    const shotWindows = actualSec.map((sec) => {
      const win = { startSec: at, endSec: at + sec };
      at += sec - (crossfaded ? fadeSec : 0);
      return win;
    });
    try {
      const finished = await finishFilmWithSoundtrack({
        video: composedBytes,
        plan: shotPlan,
        shotWindows,
        assets: await soundtrackAssets,
      });
      composedBytes = finished.bytes;
      soundtrack = finished.report;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[storyboard-video] soundtrack / text pass failed, keeping the silent film: ${message}`);
      soundtrack = { voiceoverShots: 0, music: false, textOverlays: 0, errors: [message.slice(0, 400)] };
    }
  }
  return success({
    composedBytes,
    segmentCount: clips.length,
    targetDurationSec: Math.round(expectedSec),
    ...(soundtrack ? { soundtrack } : {}),
  });
}

/**
 * Overwrite the first-clip durable blob in place so artifact labels / media
 * URLs stay valid (do not introduce a parallel composed-* key).
 */
export async function replaceDurableVideoBytes(input: {
  readonly blobStorage: IBlobStorage;
  readonly blobMetadata: IBlobMetadataRepository;
  readonly storageKey: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly artifactId: string;
  readonly bytes: Buffer;
  readonly nowIso: () => string;
}): Promise<Result<{ sizeBytes: number; checksum: string }>> {
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const put = await input.blobStorage.put(
    input.storageKey,
    input.bytes,
    "video/mp4",
  );
  if (!put.ok) return put;
  const existing = await input.blobMetadata.get(input.storageKey);
  await input.blobMetadata.register({
    storageKey: input.storageKey,
    organizationId: input.organizationId,
    executionId: input.executionId,
    artifactId: existing?.artifactId ?? input.artifactId,
    mimeType: "video/mp4",
    sizeBytes: input.bytes.byteLength,
    checksum,
    createdAt: existing?.createdAt ?? input.nowIso(),
  });
  return success({ sizeBytes: input.bytes.byteLength, checksum });
}

/**
 * After ingesting the first provider clip, continue+concat toward product
 * duration when the plan requires multiple segments. Failures are non-fatal —
 * the first clip remains the deliverable.
 */
export async function maybeComposeVideoAfterIngest(input: {
  readonly record: ProviderOperationRecord;
  readonly artifactId: string;
  readonly storageKey: string;
  readonly outputMimeType?: string;
  readonly outputType?: string;
  readonly dispatcher: IAsyncProviderDispatcher;
  readonly buildRequest: (
    payload: Record<string, unknown>,
  ) => ProviderExecutionRequest;
  readonly blobStorage: IBlobStorage;
  readonly blobMetadata: IBlobMetadataRepository;
  readonly blobAccess?: BlobAccessService;
  readonly nowIso: () => string;
  /** Persist composing/composed flags on the operation. */
  readonly patchSafeMetadata: (
    patch: Record<string, unknown>,
  ) => Promise<void>;
}): Promise<Result<{ composed: boolean; segmentCount?: number }>> {
  if (
    !shouldComposeVideoTowardTarget({
      capabilityId: input.record.capabilityId,
      safeMetadata: input.record.safeMetadata,
      outputMimeType: input.outputMimeType,
      outputType: input.outputType,
    })
  ) {
    const meta = input.record.safeMetadata ?? {};
    // Stale composing lock (crash mid-compose) — clear after 45m and retry.
    if (
      meta.videoComposing === true &&
      meta.videoComposed !== true &&
      Date.now() - Date.parse(input.record.updatedAt) > 45 * 60_000
    ) {
      await input.patchSafeMetadata({ videoComposing: false });
    } else {
      return success({ composed: false });
    }
    if (
      !shouldComposeVideoTowardTarget({
        capabilityId: input.record.capabilityId,
        safeMetadata: {
          ...(input.record.safeMetadata ?? {}),
          videoComposing: false,
        },
        outputMimeType: input.outputMimeType,
        outputType: input.outputType,
      })
    ) {
      return success({ composed: false });
    }
  }

  await input.patchSafeMetadata({ videoComposing: true });

  const meta = input.record.safeMetadata ?? {};
  const prompt =
    typeof meta.prompt === "string" && meta.prompt.trim()
      ? meta.prompt.trim()
      : "Continue the cinematic sequence from the last frame with storyboard continuity.";
  const targetDurationSec = resolveVideoTargetDurationSec(meta);
  const shotPlan = readVideoShotPlan(meta);
  const payload: Record<string, unknown> = {
    prompt,
    ...(shotPlan ? { videoShotPlan: shotPlan } : {}),
    videoTargetDurationSec: targetDurationSec,
    videoSegmentIndex: 0,
    videoSegmentCount: planVideoClipSegments({
      targetDurationSec,
    }).segmentCount,
  };

  try {
    const composed = await composeVideoTowardTargetDuration({
      executionId: input.record.executionId,
      organizationId: input.record.organizationId,
      providerId: input.record.providerId,
      modelId: input.record.modelId,
      capabilityId: input.record.capabilityId,
      prompt,
      payload,
      artifactStorageKey: input.storageKey,
      artifactId: input.artifactId,
      dispatcher: input.dispatcher,
      buildRequest: input.buildRequest,
      blobStorage: input.blobStorage,
      blobMetadata: input.blobMetadata,
      blobAccess: input.blobAccess,
      nowIso: input.nowIso,
    });
    if (!composed.ok) {
      await input.patchSafeMetadata({
        videoComposing: false,
        videoComposeFailed: true,
        videoComposeError: composed.error.message.slice(0, 400),
      });
      return success({ composed: false });
    }

    const replaced = await replaceDurableVideoBytes({
      blobStorage: input.blobStorage,
      blobMetadata: input.blobMetadata,
      storageKey: input.storageKey,
      organizationId: input.record.organizationId,
      executionId: input.record.executionId,
      artifactId: input.artifactId,
      bytes: composed.value.composedBytes,
      nowIso: input.nowIso,
    });
    if (!replaced.ok) {
      await input.patchSafeMetadata({
        videoComposing: false,
        videoComposeFailed: true,
        videoComposeError: replaced.error.message.slice(0, 400),
      });
      return success({ composed: false });
    }

    await input.patchSafeMetadata({
      videoComposing: false,
      videoComposed: true,
      videoComposeFailed: false,
      videoComposeSegmentCount: composed.value.segmentCount,
      videoComposeDurationSec: composed.value.targetDurationSec,
      ...(composed.value.soundtrack ? { videoSoundtrack: composed.value.soundtrack } : {}),
    });
    return success({
      composed: true,
      segmentCount: composed.value.segmentCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await input.patchSafeMetadata({
      videoComposing: false,
      videoComposeFailed: true,
      videoComposeError: message.slice(0, 400),
    });
    return success({ composed: false });
  }
}

/** Probe duration seconds via ffmpeg-static (best-effort). */
export async function probeMp4DurationSec(bytes: Buffer): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require("ffmpeg-static") as string;
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unagency-probe-"));
    const file = path.join(dir, "v.mp4");
    fs.writeFileSync(file, bytes);
    const duration = await new Promise<number | null>((resolve) => {
      const child = spawn(
        ffmpegPath,
        ["-i", file],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let err = "";
      child.stderr?.on("data", (c: Buffer) => {
        err += c.toString("utf8");
      });
      child.on("close", () => {
        const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
        if (!m) {
          resolve(null);
          return;
        }
        const h = Number(m[1]);
        const min = Number(m[2]);
        const s = Number(m[3]);
        resolve(h * 3600 + min * 60 + s);
      });
      child.on("error", () => resolve(null));
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return duration;
  } catch {
    return null;
  }
}

export async function resolveFirstAssetUrl(input: {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly organizationId: string;
  readonly blobAccess?: BlobAccessService;
}): Promise<string | undefined> {
  const assets = extractInputAssets(input.payload);
  if (assets.length === 0) return undefined;
  const resolved = await resolveProviderInputImageUrl({
    asset: assets[0]!,
    organizationId: input.organizationId,
    blobAccess: input.blobAccess,
  });
  return resolved.ok ? resolved.value : undefined;
}
