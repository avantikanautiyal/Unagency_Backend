/**
 * M10.18 — Media access / download audit log.
 */

import mongoose, { Schema, Document } from "mongoose";

export type MediaAccessAction =
  | "download"
  | "preview"
  | "stream"
  | "signed_url_issued"
  | "signed_url_refresh"
  | "upload"
  | "multipart_complete"
  | "delete"
  | "restore"
  | "cross_tenant_rejected";

export interface IMediaAccessAudit extends Document {
  action: MediaAccessAction;
  organizationId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  assetId?: mongoose.Types.ObjectId;
  artifactId?: string;
  storageKey?: string;
  disposition?: string;
  success: boolean;
  detail?: string;
  createdAt: Date;
}

const MediaAccessAuditSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, index: true },
    userId: { type: Schema.Types.ObjectId, index: true },
    assetId: { type: Schema.Types.ObjectId, index: true },
    artifactId: { type: String },
    storageKey: { type: String },
    disposition: { type: String },
    success: { type: Boolean, default: true },
    detail: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MediaAccessAuditSchema.index({ organizationId: 1, createdAt: -1 });

export const MediaAccessAudit =
  mongoose.models.MediaAccessAudit ||
  mongoose.model<IMediaAccessAudit>("MediaAccessAudit", MediaAccessAuditSchema);

export async function auditMediaAccess(input: {
  action: MediaAccessAction;
  organizationId?: string;
  userId?: string;
  assetId?: string;
  artifactId?: string;
  storageKey?: string;
  disposition?: string;
  success?: boolean;
  detail?: string;
}): Promise<void> {
  try {
    await MediaAccessAudit.create({
      action: input.action,
      organizationId: input.organizationId
        ? new mongoose.Types.ObjectId(input.organizationId)
        : undefined,
      userId: input.userId
        ? new mongoose.Types.ObjectId(input.userId)
        : undefined,
      assetId: input.assetId
        ? new mongoose.Types.ObjectId(input.assetId)
        : undefined,
      artifactId: input.artifactId,
      storageKey: input.storageKey,
      disposition: input.disposition,
      success: input.success !== false,
      detail: input.detail,
    });
  } catch (err) {
    console.warn(
      "[media-access-audit] write failed:",
      err instanceof Error ? err.message : err
    );
  }
}
