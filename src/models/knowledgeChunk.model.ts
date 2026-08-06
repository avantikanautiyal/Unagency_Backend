import mongoose, { Schema, Document } from "mongoose";

/**
 * M10.17 — Knowledge document chunks (minimal production document indexing).
 * Populated from text/markdown (and PDF when pdf-parse is available) product
 * assets so Global Search + Knowledge Intelligence can retrieve real
 * organisation content — never mock/demo text.
 */
export interface IKnowledgeChunk extends Document {
  organizationId: mongoose.Types.ObjectId;
  brandId?: mongoose.Types.ObjectId;
  assetId: mongoose.Types.ObjectId;
  assetName: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeChunkSchema = new Schema<IKnowledgeChunk>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
      index: true,
    },
    brandId: { type: Schema.Types.ObjectId, ref: "Brands", index: true },
    assetId: {
      type: Schema.Types.ObjectId,
      ref: "MediaFile",
      required: true,
      index: true,
    },
    assetName: { type: String, default: "" },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: undefined },
  },
  { collection: "knowledge_chunks", timestamps: true }
);

KnowledgeChunkSchema.index({ organizationId: 1, assetId: 1, chunkIndex: 1 });
KnowledgeChunkSchema.index({ organizationId: 1, text: "text" });

const KnowledgeChunk = mongoose.model<IKnowledgeChunk>(
  "KnowledgeChunk",
  KnowledgeChunkSchema
);
export default KnowledgeChunk;
