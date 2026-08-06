/**
 * M10.18 — Media processing job store (claimable Mongo jobs).
 * Reuses the same claim/retry/dead-letter pattern as execution jobs —
 * NOT a second queue product (no BullMQ media queue).
 */

import mongoose, { Schema, Document } from "mongoose";

export type MediaJobKind =
  | "media.metadata"
  | "media.thumbnail"
  | "media.compress"
  | "media.optimize"
  | "knowledge.index"
  | "knowledge.embed"
  | "knowledge.ocr"
  | "knowledge.chunk"
  | "media.cleanup"
  | "media.probe_video"
  | "media.probe_audio";

export type MediaJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "dead_letter"
  | "cancelled";

export interface IMediaProcessingJob extends Document {
  kind: MediaJobKind;
  status: MediaJobStatus;
  organizationId: mongoose.Types.ObjectId;
  assetId?: mongoose.Types.ObjectId;
  storageKey?: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  claimedBy?: string;
  claimedUntil?: Date;
  runAfter: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MediaProcessingJobSchema = new Schema(
  {
    kind: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed", "dead_letter", "cancelled"],
      default: "queued",
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assetId: { type: Schema.Types.ObjectId, ref: "MediaFile", index: true },
    storageKey: { type: String },
    payload: { type: Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lastError: { type: String },
    claimedBy: { type: String },
    claimedUntil: { type: Date },
    runAfter: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

MediaProcessingJobSchema.index({ status: 1, runAfter: 1, kind: 1 });

export const MediaProcessingJob =
  mongoose.models.MediaProcessingJob ||
  mongoose.model<IMediaProcessingJob>("MediaProcessingJob", MediaProcessingJobSchema);

export type EnqueueMediaJobInput = {
  kind: MediaJobKind;
  organizationId: string;
  assetId?: string;
  storageKey?: string;
  payload?: Record<string, unknown>;
  runAfterMs?: number;
  maxAttempts?: number;
};

export async function enqueueMediaJob(
  input: EnqueueMediaJobInput
): Promise<IMediaProcessingJob> {
  return MediaProcessingJob.create({
    kind: input.kind,
    status: "queued",
    organizationId: new mongoose.Types.ObjectId(input.organizationId),
    assetId: input.assetId
      ? new mongoose.Types.ObjectId(input.assetId)
      : undefined,
    storageKey: input.storageKey,
    payload: input.payload ?? {},
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    runAfter: new Date(Date.now() + (input.runAfterMs ?? 0)),
  });
}

export async function enqueuePostUploadJobs(input: {
  organizationId: string;
  assetId: string;
  storageKey: string;
  mimeType: string;
  brandId?: string;
  assetName?: string;
}): Promise<void> {
  const base = {
    organizationId: input.organizationId,
    assetId: input.assetId,
    storageKey: input.storageKey,
  };
  await enqueueMediaJob({ ...base, kind: "media.metadata" });

  const mime = input.mimeType.toLowerCase();
  if (mime.startsWith("image/")) {
    await enqueueMediaJob({ ...base, kind: "media.thumbnail" });
    await enqueueMediaJob({ ...base, kind: "media.optimize" });
  }
  if (mime.startsWith("video/")) {
    await enqueueMediaJob({ ...base, kind: "media.probe_video" });
    await enqueueMediaJob({ ...base, kind: "media.thumbnail" });
  }
  if (mime.startsWith("audio/")) {
    await enqueueMediaJob({ ...base, kind: "media.probe_audio" });
  }

  const indexable =
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("document") ||
    mime.includes("presentation");
  if (indexable) {
    await enqueueMediaJob({
      ...base,
      kind: "knowledge.index",
      payload: {
        brandId: input.brandId,
        assetName: input.assetName,
        mimeType: input.mimeType,
      },
    });
    await enqueueMediaJob({
      ...base,
      kind: "knowledge.chunk",
      payload: { mimeType: input.mimeType },
      runAfterMs: 500,
    });
    await enqueueMediaJob({
      ...base,
      kind: "knowledge.embed",
      payload: { mimeType: input.mimeType },
      runAfterMs: 1000,
    });
    if (mime === "application/pdf") {
      await enqueueMediaJob({
        ...base,
        kind: "knowledge.ocr",
        payload: { mimeType: input.mimeType },
        runAfterMs: 1500,
      });
    }
  }
}

/** Atomic claim for multi-worker safety */
export async function claimNextMediaJob(
  workerId: string,
  leaseMs = 60_000
): Promise<IMediaProcessingJob | null> {
  const now = new Date();
  return MediaProcessingJob.findOneAndUpdate(
    {
      status: "queued",
      runAfter: { $lte: now },
      $or: [
        { claimedUntil: { $exists: false } },
        { claimedUntil: null },
        { claimedUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: "running",
        claimedBy: workerId,
        claimedUntil: new Date(Date.now() + leaseMs),
      },
      $inc: { attempts: 1 },
    },
    { sort: { runAfter: 1 }, new: true }
  );
}
