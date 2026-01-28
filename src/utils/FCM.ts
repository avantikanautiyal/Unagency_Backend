import { Notification } from "../background/utils/notification";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { UserType } from "../types/user";

export async function sendNotificationFCM({
  notification,
  user,
}: {
  notification: Notification;
  user: UserType;
}) {
  const fcmTokens = user.fcmTokens || [];
  // Deduplicate tokens
  const uniqueTokens = [...new Set(fcmTokens)];

  if (!uniqueTokens.length) {
    console.log("No unique FCM tokens found for user:", user.userId);
    return { sent: 0, removed: 0, failed: 0 };
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const token of uniqueTokens) {
    try {
      await firebaseAdmin.messaging().send({
        token,
        notification: {
          title: notification.title || "New Message!",
          body: notification.description || "Tap to open chat",
        },
        data: {
          screen: notification.action,
        },
      });

      console.log("Notification sent to token:", token);
      sent++;
    } catch (err: any) {
      const code = err?.errorInfo?.code;

      const deadTokenErrors = [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ];

      if (deadTokenErrors.includes(code)) {
        console.log("Removing invalid/uninstalled token:", token);

        await Users.updateOne(
          { userId: user.userId },
          { $pull: { fcmTokens: token } }
        );

        removed++;
      } else {
        console.error("Error sending FCM:", code, err);
        failed++;
      }
    }
  }

  return { sent, removed, failed };
}
