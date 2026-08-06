/**
 * M10.18 — Multipart upload session metadata (resume / cancel).
 */

import mongoose, { Schema, Document } from "mongoose";

export type MultipartSessionStatus =
  | "initiated"
  | "uploading"
  | "completed"
  | "aborted"
  | "expired";

export interface IMultipartUploadSession extends Document {
  uploadId: string;
  storageKey: string;
  assetId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  mimeType: string;
  filename: string;
  status: MultipartSessionStatus;
  parts: { partNumber: number; etag: string; sizeBytes: number }[];
  checksum?: string;
  brandId?: mongoose.Types.ObjectId;
  folder?: string;
  projectId?: mongoose.Types.ObjectId;
  briefId?: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MultipartUploadSessionSchema = new Schema(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    storageKey: { type: String, required: true },
    assetId: { type: Schema.Types.ObjectId, ref: "MediaFile", required: true },
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    mimeType: { type: String, required: true },
    filename: { type: String, required: true },
    status: {
      type: String,
      enum: ["initiated", "uploading", "completed", "aborted", "expired"],
      default: "initiated",
      index: true,
    },
    parts: {
      type: [
        {
          partNumber: Number,
          etag: String,
          sizeBytes: Number,
        },
      ],
      default: [],
    },
    checksum: { type: String },
    brandId: { type: Schema.Types.ObjectId },
    folder: { type: String },
    projectId: { type: Schema.Types.ObjectId },
    briefId: { type: Schema.Types.ObjectId },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const MultipartUploadSession =
  mongoose.models.MultipartUploadSession ||
  mongoose.model<IMultipartUploadSession>(
    "MultipartUploadSession",
    MultipartUploadSessionSchema
  );
