/**
 * User preferences + privacy persistence (M10.12).
 */

import mongoose from "mongoose";
import UserPreferences, {
  type IUserPreferences,
} from "../models/userPreferences.model";
import { ApiError } from "../utils/apiError";

export type UserPreferencesDto = {
  userId: string;
  theme: "system" | "light" | "dark";
  language: string;
  timezone: string;
  defaultWorkspaceId?: string;
  notifications: IUserPreferences["notifications"];
  ai: IUserPreferences["ai"];
  privacy: {
    profileVisibility: "org" | "private";
    dataExportRequestedAt?: string;
    deleteAccountRequestedAt?: string;
    notificationPermission: "granted" | "denied" | "unset";
  };
  updatedAt: string;
};

function toDto(doc: IUserPreferences): UserPreferencesDto {
  return {
    userId: doc.userId.toString(),
    theme: doc.theme,
    language: doc.language,
    timezone: doc.timezone,
    defaultWorkspaceId: doc.defaultWorkspaceId,
    notifications: {
      pushEnabled: doc.notifications?.pushEnabled ?? true,
      emailEnabled: doc.notifications?.emailEnabled ?? true,
      productUpdates: doc.notifications?.productUpdates ?? true,
      approvals: doc.notifications?.approvals ?? true,
    },
    ai: {
      quality: doc.ai?.quality ?? "standard",
      style: doc.ai?.style ?? "balanced",
      routesPerGeneration: doc.ai?.routesPerGeneration ?? 3,
      smartFeatures: doc.ai?.smartFeatures ?? true,
    },
    privacy: {
      profileVisibility: doc.privacy?.profileVisibility ?? "org",
      dataExportRequestedAt: doc.privacy?.dataExportRequestedAt
        ? doc.privacy.dataExportRequestedAt.toISOString()
        : undefined,
      deleteAccountRequestedAt: doc.privacy?.deleteAccountRequestedAt
        ? doc.privacy.deleteAccountRequestedAt.toISOString()
        : undefined,
      notificationPermission: doc.privacy?.notificationPermission ?? "unset",
    },
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

export class UserPreferencesService {
  async getOrCreate(userId: string): Promise<UserPreferencesDto> {
    if (!mongoose.isValidObjectId(userId)) {
      throw new ApiError("Invalid userId", 400);
    }
    let doc = await UserPreferences.findOne({ userId });
    if (!doc) {
      doc = await UserPreferences.create({
        userId: new mongoose.Types.ObjectId(userId),
      });
    }
    return toDto(doc);
  }

  async update(
    userId: string,
    patch: Partial<{
      theme: UserPreferencesDto["theme"];
      language: string;
      timezone: string;
      defaultWorkspaceId: string | null;
      notifications: Partial<UserPreferencesDto["notifications"]>;
      ai: Partial<UserPreferencesDto["ai"]>;
      privacy: Partial<{
        profileVisibility: "org" | "private";
        notificationPermission: "granted" | "denied" | "unset";
        requestDataExport: boolean;
        requestDeleteAccount: boolean;
      }>;
    }>
  ): Promise<UserPreferencesDto> {
    const doc = await UserPreferences.findOne({ userId });
    const current =
      doc ??
      (await UserPreferences.create({
        userId: new mongoose.Types.ObjectId(userId),
      }));

    if (patch.theme) current.theme = patch.theme;
    if (patch.language != null) current.language = String(patch.language);
    if (patch.timezone != null) current.timezone = String(patch.timezone);
    if (patch.defaultWorkspaceId === null) {
      current.defaultWorkspaceId = undefined;
    } else if (patch.defaultWorkspaceId != null) {
      current.defaultWorkspaceId = String(patch.defaultWorkspaceId);
    }
    if (patch.notifications) {
      current.notifications = {
        ...current.notifications,
        ...patch.notifications,
      };
    }
    if (patch.ai) {
      current.ai = { ...current.ai, ...patch.ai };
    }
    if (patch.privacy) {
      if (patch.privacy.profileVisibility) {
        current.privacy.profileVisibility = patch.privacy.profileVisibility;
      }
      if (patch.privacy.notificationPermission) {
        current.privacy.notificationPermission =
          patch.privacy.notificationPermission;
      }
      if (patch.privacy.requestDataExport) {
        current.privacy.dataExportRequestedAt = new Date();
      }
      if (patch.privacy.requestDeleteAccount) {
        current.privacy.deleteAccountRequestedAt = new Date();
      }
    }
    await current.save();
    return toDto(current);
  }
}

export const userPreferencesService = new UserPreferencesService();
