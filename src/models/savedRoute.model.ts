import mongoose, { Schema, Document } from "mongoose";

/**
 * Saved prompt routes / workflows (M10.12).
 */

export interface ISavedRoute extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  title: string;
  prompt: string;
  subtitle?: string;
  intent?: string;
  capabilityId?: string;
  /** ExecutionArtifact id — FE refreshes signed media URL on load. */
  artifactId?: string;
  executionId?: string;
  /** Client route id from Create Design carousel (dedupe key). */
  sourceRouteId?: string;
  mediaKind?: string;
  pinned: boolean;
  favorite: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SavedRouteSchema = new Schema<ISavedRoute>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    prompt: { type: String, required: true },
    subtitle: { type: String },
    intent: { type: String },
    capabilityId: { type: String },
    artifactId: { type: String, index: true },
    executionId: { type: String, index: true },
    sourceRouteId: { type: String, index: true },
    mediaKind: { type: String },
    pinned: { type: Boolean, default: false, index: true },
    favorite: { type: Boolean, default: false, index: true },
    lastUsedAt: { type: Date },
  },
  { collection: "saved_routes", timestamps: true }
);

SavedRouteSchema.index({ userId: 1, organizationId: 1, updatedAt: -1 });
SavedRouteSchema.index(
  { userId: 1, sourceRouteId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceRouteId: { $type: "string", $gt: "" },
    },
  }
);

const SavedRoutes = mongoose.model<ISavedRoute>("SavedRoutes", SavedRouteSchema);
export default SavedRoutes;
