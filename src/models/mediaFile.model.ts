import mongoose, { Schema, Document } from "mongoose";

/**
 * Product asset metadata SoT (M10.4).
 * Physical bytes live in IBlobStorage under storageKey.
 * Legacy rows may only have public `url` without ownership fields.
 */

export type ProductAssetStatus = "active" | "deleted";
export type ProductAssetKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "other";

export interface IMediaFile extends Document {
  url: string;
  uploadedAt: Date;
  fileName: string;
  tag: string;
  /** Server-controlled blob key (preferred for M10.4 private assets) */
  storageKey?: string;
  organizationId?: mongoose.Types.ObjectId;
  uploaderUserId?: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  briefId?: mongoose.Types.ObjectId;
  mimeType?: string;
  sizeBytes?: number;
  kind?: ProductAssetKind;
  status?: ProductAssetStatus;
  checksum?: string;
}

const MediaFileSchema: Schema = new Schema(
  {
    url: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    tag: {
      type: String,
      default: "",
    },
    storageKey: { type: String },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organizations",
      index: true,
    },
    uploaderUserId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Projects",
    },
    briefId: {
      type: Schema.Types.ObjectId,
      ref: "requirements",
    },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    kind: {
      type: String,
      enum: ["image", "video", "audio", "document", "other"],
    },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
      index: true,
    },
    checksum: { type: String },
  },
  {
    timestamps: true,
  }
);

MediaFileSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

const MediaFile = mongoose.model<IMediaFile>("MediaFile", MediaFileSchema);

export default MediaFile;
