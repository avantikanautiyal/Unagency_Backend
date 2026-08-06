import mongoose, { Schema, Document } from "mongoose";

/**
 * User preferences + privacy (M10.12) — single durable document per user.
 */

export interface IUserPreferences extends Document {
  userId: mongoose.Types.ObjectId;
  theme: "system" | "light" | "dark";
  language: string;
  timezone: string;
  defaultWorkspaceId?: string;
  notifications: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    productUpdates: boolean;
    approvals: boolean;
  };
  ai: {
    quality: "standard" | "high" | "max";
    style: string;
    routesPerGeneration: number;
    smartFeatures: boolean;
  };
  privacy: {
    profileVisibility: "org" | "private";
    dataExportRequestedAt?: Date;
    deleteAccountRequestedAt?: Date;
    notificationPermission: "granted" | "denied" | "unset";
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserPreferencesSchema = new Schema<IUserPreferences>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: ["system", "light", "dark"],
      default: "system",
    },
    language: { type: String, default: "en" },
    timezone: { type: String, default: "UTC" },
    defaultWorkspaceId: { type: String },
    notifications: {
      pushEnabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
      productUpdates: { type: Boolean, default: true },
      approvals: { type: Boolean, default: true },
    },
    ai: {
      quality: {
        type: String,
        enum: ["standard", "high", "max"],
        default: "standard",
      },
      style: { type: String, default: "balanced" },
      routesPerGeneration: { type: Number, default: 3, min: 1, max: 6 },
      smartFeatures: { type: Boolean, default: true },
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ["org", "private"],
        default: "org",
      },
      dataExportRequestedAt: { type: Date },
      deleteAccountRequestedAt: { type: Date },
      notificationPermission: {
        type: String,
        enum: ["granted", "denied", "unset"],
        default: "unset",
      },
    },
  },
  { collection: "user_preferences", timestamps: true }
);

const UserPreferences = mongoose.model<IUserPreferences>(
  "UserPreferences",
  UserPreferencesSchema
);
export default UserPreferences;
