import { Schema, model } from "mongoose";

const enterpriseBlobMetadataSchema = new Schema(
  {
    storageKey: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, index: true },
    artifactId: { type: String, index: true },
    mimeType: String,
    sizeBytes: Number,
    checksum: String,
    createdAt: { type: String, required: true },
  },
  { collection: "enterprise_blob_metadata" }
);

enterpriseBlobMetadataSchema.index({ organizationId: 1, storageKey: 1 });

export const EnterpriseBlobMetadata = model(
  "EnterpriseBlobMetadata",
  enterpriseBlobMetadataSchema
);
