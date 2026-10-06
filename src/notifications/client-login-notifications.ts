import mongoose from "mongoose";
import Users from "../models/users.model";
import type { ClientNotificationEventKey } from "./client-notification-catalog";
import { dispatchClientNotification } from "./client-notification-service";

const LOGIN_EVENT_BY_PROVIDER: Record<string, ClientNotificationEventKey> = {
  "google.com": "GOOGLE_LOGIN",
  "apple.com": "APPLE_ID_LOGIN",
  phone: "PHONE_LOGIN",
};

const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function deviceLabel(userAgent?: string): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : /Expo|okhttp|CFNetwork|Dart/i.test(ua)
              ? "UNAGENCY app"
              : "a browser";
  const os = /iPhone|iPad|iOS/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "an unknown device";
  return `${browser} on ${os}`;
}

/**
 * Firebase sign-in happens on the client, so a login is detected the first
 * time the backend sees a token with a newer `auth_time` than `lastLoginAt`.
 * The conditional update lets exactly one concurrent request claim it.
 */
export async function recordClientLogin(input: {
  user: { _id: mongoose.Types.ObjectId; role?: string; name?: string; createdAt?: Date };
  authTime?: number;
  signInProvider?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    if (input.user.role !== "customer" || !input.authTime) return;
    const signedInAt = new Date(input.authTime * 1000);
    const device = deviceLabel(input.userAgent);
    const previous = await Users.findOneAndUpdate(
      {
        _id: input.user._id,
        $or: [
          { lastLoginAt: { $exists: false } },
          { lastLoginAt: null },
          { lastLoginAt: { $lt: signedInAt } },
        ],
      },
      { $set: { lastLoginAt: signedInAt }, $addToSet: { knownDevices: device } },
      {
        new: false,
        projection: { lastLoginAt: 1, createdAt: 1, name: 1, knownDevices: 1 },
      }
    ).lean();
    if (!previous) return;

    const createdAt = (previous as { createdAt?: Date }).createdAt ?? input.user.createdAt;
    const isNewAccount =
      !previous.lastLoginAt &&
      !!createdAt &&
      Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_WINDOW_MS;
    const name = previous.name || input.user.name || "there";

    if (isNewAccount) {
      await dispatchClientNotification({
        eventKey: "FIRST_LOGIN",
        userId: input.user._id,
        variables: { Name: name },
        primaryAction: { action: "/setup-business", text: "Set Up Business" },
        dedupeKey: "first-login",
      });
      return;
    }

    const knownDevices = previous.knownDevices ?? [];
    if (knownDevices.length > 0 && !knownDevices.includes(device)) {
      await dispatchClientNotification({
        eventKey: "NEW_DEVICE_LOGIN",
        userId: input.user._id,
        variables: { Device: device },
        primaryAction: { action: "/profile" },
        entityType: "session",
        dedupeKey: `new-device:${input.authTime}`,
      });
      return;
    }

    await dispatchClientNotification({
      eventKey: LOGIN_EVENT_BY_PROVIDER[input.signInProvider ?? ""] ?? "EMAIL_LOGIN",
      userId: input.user._id,
      variables: { Name: name },
      primaryAction: { action: "/home" },
      entityType: "session",
      dedupeKey: `login:${input.authTime}`,
    });
  } catch (error) {
    console.error("[recordClientLogin] failed", error);
  }
}
