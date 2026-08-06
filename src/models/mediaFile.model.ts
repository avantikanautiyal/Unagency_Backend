import mongoose, { Schema, Document } from "mongoose";

/**
 * Product asset metadata SoT (M10.4 + M10.18).
 * Physical bytes live in IBlobStorage under storageKey.
 * Legacy rows may only have public `url` without ownership fields.
 */

export type ProductAssetStatus = "active" | "deleted";
export type ProductAssetLifecycle =
  | "temporary"
  | "draft"
  | "published"
  | "archived"
  | "deleted";
export type ProductAssetKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "other";
export type BrandAssetApprovalStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected";
export type ScanStatus = "pending" | "clean" | "infected" | "skipped" | "error";

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
  brandId?: mongoose.Types.ObjectId;
  folder?: string;
  tags?: string[];
  mimeType?: string;
  sizeBytes?: number;
  kind?: ProductAssetKind;
  status?: ProductAssetStatus;
  lifecycle?: ProductAssetLifecycle;
  checksum?: string;
  /** M10.18 */
  scanStatus?: ScanStatus;
  approvalStatus?: BrandAssetApprovalStatus;
  parentAssetId?: mongoose.Types.ObjectId;
  version?: number;
  thumbnailKey?: string;
  preview?: {
    available?: boolean;
    width?: number;
    height?: number;
  };
  mediaMeta?: Record<string, unknown>;
  deletedAt?: Date;
  etag?: string;
  contentDispositionDefault?: "inline" | "attachment";
  /** Execution lineage (when asset originated from / linked to execution) */
  executionId?: string;
  promptHash?: string;
  modelId?: string;
  providerId?: string;
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
    brandId: {
      type: Schema.Types.ObjectId,
      ref: "Brands",
      index: true,
    },
    folder: { type: String, default: "", index: true },
    tags: { type: [String], default: [] },
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
    lifecycle: {
      type: String,
      enum: ["temporary", "draft", "published", "archived", "deleted"],
      default: "published",
      index: true,
    },
    checksum: { type: String, index: true },
    scanStatus: {
      type: String,
      enum: ["pending", "clean", "infected", "skipped", "error"],
      default: "pending",
    },
    approvalStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },
    parentAssetId: { type: Schema.Types.ObjectId, ref: "MediaFile" },
    version: { type: Number, default: 1 },
    thumbnailKey: { type: String },
    preview: {
      available: { type: Boolean, default: false },
      width: { type: Number },
      height: { type: Number },
    },
    mediaMeta: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date },
    etag: { type: String },
    contentDispositionDefault: {
      type: String,
      enum: ["inline", "attachment"],
      default: "inline",
    },
    executionId: { type: String, index: true },
    promptHash: { type: String },
    modelId: { type: String },
    providerId: { type: String },
  },
  {
    timestamps: true,
  }
);

MediaFileSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
MediaFileSchema.index({ organizationId: 1, brandId: 1, status: 1 });
MediaFileSchema.index({ organizationId: 1, folder: 1, status: 1 });
MediaFileSchema.index({ organizationId: 1, checksum: 1, status: 1 });
MediaFileSchema.index({ organizationId: 1, lifecycle: 1, status: 1 });

const MediaFile = mongoose.model<IMediaFile>("MediaFile", MediaFileSchema);

export default MediaFile;
