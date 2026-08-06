/**
 * M10.18 — Background media processing worker.
 * Ticked on an interval (same lifecycle style as AsyncReconciliationWorker).
 * Does NOT introduce BullMQ — claimable Mongo jobs only.
 */

import MediaFile from "../../../models/mediaFile.model";
import { getProductAssetBlobStorage } from "../../../services/product-asset-storage";
import { extractBasicMediaMeta } from "./media-metadata-extractor";
import {
  claimNextMediaJob,
  type IMediaProcessingJob,
  MediaProcessingJob,
} from "./media-processing-job-store";

export class MediaProcessingWorker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private shutDown = false;
  private active = 0;

  constructor(
    private readonly options: {
      workerId?: string;
      tickIntervalMs?: number;
      maxPerTick?: number;
    } = {}
  ) {}

  start(): void {
    if (this.timer) return;
    const interval = this.options.tickIntervalMs ?? 2000;
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
  }

  async tick(): Promise<number> {
    if (this.shutDown) return 0;
    this.running = true;
    let processed = 0;
    const max = this.options.maxPerTick ?? 4;
    const workerId = this.options.workerId ?? "media-processor";
    try {
      for (let i = 0; i < max; i++) {
        const job = await claimNextMediaJob(workerId);
        if (!job) break;
        this.active += 1;
        try {
          await this.execute(job);
          job.status = "completed";
          job.completedAt = new Date();
          await job.save();
          processed += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          job.lastError = message;
          if (job.attempts >= job.maxAttempts) {
            job.status = "dead_letter";
          } else {
            job.status = "queued";
            job.runAfter = new Date(
              Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts)
            );
            job.claimedBy = undefined;
            job.claimedUntil = undefined;
          }
          await job.save();
        } finally {
          this.active -= 1;
        }
      }
    } finally {
      this.running = false;
    }
    return processed;
  }

  private async execute(job: IMediaProcessingJob): Promise<void> {
    switch (job.kind) {
      case "media.metadata":
      case "media.probe_video":
      case "media.probe_audio":
        await this.runMetadata(job);
        return;
      case "media.thumbnail":
        await this.runThumbnailHook(job);
        return;
      case "media.compress":
      case "media.optimize":
        // Hook only — mark processing note; no byte rewrite (immutability-safe)
        await this.markProcessing(job, job.kind, "hook_acknowledged");
        return;
      case "knowledge.index":
      case "knowledge.chunk":
      case "knowledge.embed":
      case "knowledge.ocr":
        await this.runKnowledge(job);
        return;
      case "media.cleanup":
        await this.runCleanup(job);
        return;
      default:
        return;
    }
  }

  private async runMetadata(job: IMediaProcessingJob): Promise<void> {
    if (!job.assetId || !job.storageKey) return;
    const storage = getProductAssetBlobStorage();
    const got = await storage.get(job.storageKey);
    if (!got.ok || !got.value) {
      throw new Error("blob unavailable for metadata extraction");
    }
    const bytes = Buffer.from(got.value.data, "base64");
    const doc = await MediaFile.findById(job.assetId);
    if (!doc) return;
    const meta = extractBasicMediaMeta({
      mimeType: doc.mimeType || got.value.contentType || "application/octet-stream",
      bytes,
    });
    doc.mediaMeta = {
      ...(doc.mediaMeta || {}),
      ...meta,
      processing: {
        ...(doc.mediaMeta?.processing || {}),
        metadata: "completed",
        updatedAt: new Date().toISOString(),
      },
    };
    if (meta.image?.width && meta.image?.height) {
      doc.preview = {
        available: true,
        width: meta.image.width,
        height: meta.image.height,
      };
    }
    await doc.save();
  }

  private async runThumbnailHook(job: IMediaProcessingJob): Promise<void> {
    // Production hook: sibling thumbnail key would be written by an image worker.
    // We record intent + source dimensions without introducing a second storage stack.
    await this.markProcessing(job, "media.thumbnail", "queued_for_renderer");
    if (!job.assetId) return;
    const doc = await MediaFile.findById(job.assetId);
    if (!doc) return;
    if (doc.kind === "image" && doc.storageKey) {
      doc.thumbnailKey = doc.thumbnailKey || `${doc.storageKey}.thumb.webp`;
      doc.preview = { ...(doc.preview || {}), available: true };
      await doc.save();
    }
  }

  private async runKnowledge(job: IMediaProcessingJob): Promise<void> {
    if (!job.assetId || !job.storageKey) return;
    const { isIndexableMimeType, indexProductAsset } = await import(
      "../../../services/knowledge-document-index-service"
    );
    const mime = String(job.payload?.mimeType || "");
    if (!isIndexableMimeType(mime)) return;
    // indexProductAsset already chunks + optional embed — OCR is a no-op hook flag
    if (job.kind === "knowledge.ocr") {
      await this.markProcessing(job, "knowledge.ocr", "hook_acknowledged");
      return;
    }
    if (job.kind === "knowledge.chunk" || job.kind === "knowledge.embed") {
      // Covered by indexProductAsset; acknowledge without duplicate heavy work
      // except for knowledge.index which performs the real work.
      if (job.kind !== "knowledge.index") {
        await this.markProcessing(job, job.kind, "delegated_to_index");
        return;
      }
    }
    await indexProductAsset({
      organizationId: job.organizationId.toString(),
      brandId: job.payload?.brandId
        ? String(job.payload.brandId)
        : undefined,
      assetId: job.assetId.toString(),
      assetName: job.payload?.assetName
        ? String(job.payload.assetName)
        : undefined,
      mimeType: mime,
      storageKey: job.storageKey,
    });
    await this.markProcessing(job, "knowledge.index", "completed");
  }

  private async runCleanup(job: IMediaProcessingJob): Promise<void> {
    if (!job.storageKey) return;
    const doc = job.assetId ? await MediaFile.findById(job.assetId) : null;
    if (doc && doc.status !== "deleted") {
      // Restored before retention — skip GC
      return;
    }
    const storage = getProductAssetBlobStorage();
    await storage.delete(job.storageKey);
    if (doc?.thumbnailKey) {
      await storage.delete(doc.thumbnailKey).catch(() => undefined);
    }
  }

  private async markProcessing(
    job: IMediaProcessingJob,
    key: string,
    state: string
  ): Promise<void> {
    if (!job.assetId) return;
    const doc = await MediaFile.findById(job.assetId);
    if (!doc) return;
    doc.mediaMeta = {
      ...(doc.mediaMeta || {}),
      processing: {
        ...(doc.mediaMeta?.processing || {}),
        [key]: state,
        updatedAt: new Date().toISOString(),
      },
    };
    await doc.save();
  }

  async shutdown(): Promise<void> {
    this.shutDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const deadline = Date.now() + 10_000;
    while (this.active > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

let singletonWorker: MediaProcessingWorker | undefined;

export function getMediaProcessingWorker(): MediaProcessingWorker {
  if (!singletonWorker) {
    singletonWorker = new MediaProcessingWorker({
      workerId: `media-${process.pid}`,
      tickIntervalMs: Number(process.env.MEDIA_PROCESSING_TICK_MS ?? 2000) || 2000,
    });
  }
  return singletonWorker;
}

export function startMediaProcessingWorker(): MediaProcessingWorker {
  const w = getMediaProcessingWorker();
  if (process.env.MEDIA_PROCESSING_WORKER !== "false") {
    w.start();
  }
  return w;
}

/** Test helper — process dead letters list */
export async function listMediaDeadLetters(limit = 50) {
  return MediaProcessingJob.find({ status: "dead_letter" })
    .sort({ updatedAt: -1 })
    .limit(limit);
}

export async function retryMediaDeadLetter(jobId: string): Promise<boolean> {
  const job = await MediaProcessingJob.findById(jobId);
  if (!job || job.status !== "dead_letter") return false;
  job.status = "queued";
  job.attempts = 0;
  job.runAfter = new Date();
  job.lastError = undefined;
  job.claimedBy = undefined;
  job.claimedUntil = undefined;
  await job.save();
  return true;
}
