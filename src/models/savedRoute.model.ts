import mongoose, { Schema, Document } from "mongoose";

/**
 * Saved prompt routes / workflows (M10.12).
 */

export interface ISavedRoute extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  title: string;
  prompt: string;
  intent?: string;
  capabilityId?: string;
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
    intent: { type: String },
    capabilityId: { type: String },
    pinned: { type: Boolean, default: false, index: true },
    favorite: { type: Boolean, default: false, index: true },
    lastUsedAt: { type: Date },
  },
  { collection: "saved_routes", timestamps: true }
);

SavedRouteSchema.index({ userId: 1, organizationId: 1, updatedAt: -1 });

const SavedRoutes = mongoose.model<ISavedRoute>("SavedRoutes", SavedRouteSchema);
export default SavedRoutes;
