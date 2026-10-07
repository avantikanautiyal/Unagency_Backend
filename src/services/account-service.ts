/**
 * Self-service account: profile read/update and permanent account deletion.
 */

import mongoose from "mongoose";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import Organizations from "../models/organization.model";
import Teams from "../models/team.model";
import Brands from "../models/brand.model";
import MediaFile from "../models/mediaFile.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import Notifications from "../models/notification.model";
import UserPreferences from "../models/userPreferences.model";
import SavedRoutes from "../models/savedRoute.model";
import SearchRecent from "../models/searchRecent.model";
import Subscriptions from "../models/subscription.model";
import razorpayInstance from "../utils/razorpayInstance";
import { ApiError } from "../utils/apiError";

export type AccountProfileDto = {
  id: string;
  name: string;
  email: string;
  phone: string;
  bio: string;
  image: string | null;
};

const BIO_MAX = 160;
const NAME_MAX = 120;
const PHONE_MAX = 20;
/** Avatars are resized client-side; this caps the stored data URL (~375KB of image bytes). */
const IMAGE_DATA_URL_MAX = 500_000;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
]);

function toProfileDto(user: {
  _id: unknown;
  name?: string;
  email?: string;
  contact?: unknown;
  bio?: string;
  image?: string;
}): AccountProfileDto {
  return {
    id: String(user._id),
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.contact != null ? String(user.contact) : "",
    bio: user.bio ?? "",
    image: user.image || null,
  };
}

async function loadUser(userId: string) {
  if (!mongoose.isValidObjectId(userId)) throw new ApiError("Invalid user", 400);
  const user = await Users.findById(userId);
  if (!user) throw new ApiError("User not found", 404);
  return user;
}

export class AccountService {
  async getProfile(userId: string): Promise<AccountProfileDto> {
    return toProfileDto(await loadUser(userId));
  }

  async updateProfile(
    userId: string,
    patch: { name?: unknown; phone?: unknown; bio?: unknown; image?: unknown }
  ): Promise<AccountProfileDto> {
    const user = await loadUser(userId);

    if (patch.name !== undefined) {
      const name = String(patch.name ?? "").trim().replace(/\s+/g, " ");
      if (!name) throw new ApiError("Name cannot be empty", 400);
      if (name.length > NAME_MAX) throw new ApiError("Name is too long", 400);
      if (name !== user.name) {
        await firebaseAdmin.auth().updateUser(user.firebaseId, { displayName: name });
        user.name = name;
      }
    }

    if (patch.phone !== undefined) {
      const phone = String(patch.phone ?? "").trim();
      if (phone && !/^\+?[0-9\s-]{6,}$/.test(phone)) {
        throw new ApiError("Enter a valid phone number", 400);
      }
      if (phone.length > PHONE_MAX) throw new ApiError("Phone number is too long", 400);
      user.set("contact", phone);
    }

    if (patch.bio !== undefined) {
      const bio = String(patch.bio ?? "").trim();
      if (bio.length > BIO_MAX) {
        throw new ApiError(`Bio must be ${BIO_MAX} characters or fewer`, 400);
      }
      user.bio = bio;
    }

    if (patch.image !== undefined) {
      if (patch.image === null || patch.image === "") {
        user.set("image", undefined);
      } else {
        const image = String(patch.image);
        if (!IMAGE_DATA_URL_RE.test(image)) {
          throw new ApiError("Photo must be a JPG, PNG, GIF or WebP image", 400);
        }
        if (image.length > IMAGE_DATA_URL_MAX) {
          throw new ApiError("Photo is too large", 400);
        }
        user.image = image;
      }
    }

    await user.save();
    return toProfileDto(user);
  }

  /**
   * Permanently deletes the caller: cancels live billing, removes owned
   * workspaces and their data, personal records, and the Firebase login.
   */
  async deleteAccount(userId: string): Promise<{ deleted: true }> {
    const user = await loadUser(userId);
    const uid = user._id;

    const liveSubscriptions = (
      await Subscriptions.find({ userId: String(uid) })
    ).filter((s) => LIVE_SUBSCRIPTION_STATUSES.has(String(s.status)));
    for (const sub of liveSubscriptions) {
      try {
        const cancelled = await razorpayInstance.subscriptions.cancel(
          sub.subscriptionId,
          false
        );
        sub.status = String(cancelled.status ?? "cancelled");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new ApiError(
          `Could not cancel your subscription, so your account was not deleted. ${message}`,
          502
        );
      }
      sub.cancelledByUser = true;
      sub.razorpayCancelRequested = true;
      sub.cancelledAt = new Date();
      await sub.save();
    }

    const ownedOrgIds = (
      await Organizations.find({ owner: uid }).select("_id").lean()
    ).map((o) => o._id);
    if (ownedOrgIds.length) {
      await Promise.all([
        Brands.deleteMany({ organizationId: { $in: ownedOrgIds } }),
        MediaFile.deleteMany({ organizationId: { $in: ownedOrgIds } }),
        SavedRoutes.deleteMany({ organizationId: { $in: ownedOrgIds } }),
        Teams.deleteMany({ Organization: { $in: ownedOrgIds } }),
      ]);
      await Organizations.deleteMany({ _id: { $in: ownedOrgIds } });
    }

    await Promise.all([
      Teams.deleteMany({ userId: uid }),
      Brands.updateMany({ memberUserIds: uid }, { $pull: { memberUserIds: uid } }),
      Projects.deleteMany({ userId: uid }),
      Requirement.deleteMany({ userId: uid }),
      Notifications.deleteMany({ userId: uid }),
      UserPreferences.deleteMany({ userId: uid }),
      SavedRoutes.deleteMany({ userId: uid }),
      SearchRecent.deleteMany({ userId: uid }),
    ]);

    if (user.firebaseId) {
      try {
        await firebaseAdmin.auth().deleteUser(user.firebaseId);
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "";
        if (code !== "auth/user-not-found") {
          throw new ApiError("Could not remove the login account", 500);
        }
      }
    }

    await Users.deleteOne({ _id: uid });
    return { deleted: true };
  }
}

export const accountService = new AccountService();
