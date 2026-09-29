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
import { concatMp4Videos, extractLastFramePng } from "./video-ffmpeg";
import {
  resolveVideoTargetDurationSec,
  shouldComposeVideoTowardTarget,
} from "./video-compose-safe-metadata";

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
  }>
> {
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
  const payload: Record<string, unknown> = {
    prompt,
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
