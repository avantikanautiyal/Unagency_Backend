import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Notifications from "../models/notification.model";
import { RequestUser } from "../types/user";
import Users from "../models/users.model";
import firebaseAdmin from "../libs/firebase";
import { ApiError } from "../utils/apiError";
import mongoose from "mongoose";
import { EmailQueue } from "../background/queue/email.queue";
import { Notification, NotificationType } from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
const fetchMyNotifications = asyncHandler(async (req: RequestUser) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const includeArchived = req.query.archived === "1";
    const category = req.query.category as string | undefined;
    const filter: Record<string, unknown> = {
        userId: req.user?.userId,
    };
    if (!includeArchived) {
        filter.archived = { $ne: true };
    }
    if (category) filter.category = category;
    const [notifications, total] = await Promise.all([
        Notifications.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Notifications.countDocuments(filter),
    ]);
    return new ApiResponse(
        200,
        { items: notifications, page, limit, total },
        "Notification fetched"
    );
});

/** M10.9 — mark one notification read (owner only). */
const markNotificationRead = asyncHandler(async (req: RequestUser) => {
    const notificationId = req.params?.notificationId;
    if (!notificationId || !req.user?.userId) {
        throw new ApiError("notificationId required", 400);
    }
    const updated = await Notifications.findOneAndUpdate(
        {
            _id: notificationId,
            userId: req.user.userId,
        },
        { $set: { isRead: true } },
        { new: true }
    );
    if (!updated) {
        throw new ApiError("Notification not found", 404);
    }
    return new ApiResponse(200, updated, "Notification marked read");
});

/** M10.9 — mark all notifications read for authenticated principal. */
const markAllNotificationsRead = asyncHandler(async (req: RequestUser) => {
    if (!req.user?.userId) {
        throw new ApiError("User required", 401);
    }
    const result = await Notifications.updateMany(
        { userId: req.user.userId, isRead: false, archived: { $ne: true } },
        { $set: { isRead: true } }
    );
    return new ApiResponse(
        200,
        { modifiedCount: result.modifiedCount ?? 0 },
        "All notifications marked read"
    );
});

/** M10.12 — archive one notification (owner only). */
const archiveNotification = asyncHandler(async (req: RequestUser) => {
    const notificationId = req.params?.notificationId;
    if (!notificationId || !req.user?.userId) {
        throw new ApiError("notificationId required", 400);
    }
    const updated = await Notifications.findOneAndUpdate(
        { _id: notificationId, userId: req.user.userId },
        { $set: { archived: true } },
        { new: true }
    );
    if (!updated) throw new ApiError("Notification not found", 404);
    return new ApiResponse(200, updated, "Notification archived");
});

/** M10.12 — delete one notification (owner only). */
const deleteNotification = asyncHandler(async (req: RequestUser) => {
    const notificationId = req.params?.notificationId;
    if (!notificationId || !req.user?.userId) {
        throw new ApiError("notificationId required", 400);
    }
    const deleted = await Notifications.findOneAndDelete({
        _id: notificationId,
        userId: req.user.userId,
    });
    if (!deleted) throw new ApiError("Notification not found", 404);
    return new ApiResponse(200, { deleted: true, id: notificationId }, "Notification deleted");
});


const sendNotification = asyncHandler(async (req: RequestUser) => {
    const { title, message, userIds, screen } = req.body;

    const users = await Users.find({ _id: { $in: userIds } });

    if (users.length === 0) {
        return new ApiResponse(200, null, "User not found");
    }

    for (let user of users) {
        const fcmTokens = user.fcmTokens ?? [];

        for (const token of fcmTokens) {
            try {
                await firebaseAdmin.messaging().send({
                    token,
                    notification: {
                        title: title || "New Message!",
                        body: message || "Tap to open chat",
                    },
                    data: {
                        screen: screen || "message",
                    },
                });

                // console.log("Notification sent to token:", token);
            } catch (err: any) {
                const code = err?.errorInfo?.code;

                const deadTokenErrors = [
                    "messaging/registration-token-not-registered",
                    "messaging/invalid-registration-token",
                ];

                if (deadTokenErrors.includes(code)) {
                    console.log("Removing invalid/uninstalled token:", token);

                    await Users.updateOne(
                        { _id: user._id },
                        { $pull: { fcmTokens: token } }
                    );
                } else {
                    console.error("Error sending FCM:", code, err);
                }
            }
        }

    }


    // const fcmTokens = users.map((user) => user.fcmTokens);

    // for (const token of fcmTokens) {
    //     try {
    //         await firebaseAdmin.messaging().send({
    //             token,
    //             notification: {
    //                 title: title || "New Message!",
    //                 body: message || "Tap to open chat",
    //             },
    //             data: {
    //                 screen: screen || "message",
    //             },
    //         });

    //         // console.log("Notification sent to token:", token);
    //     } catch (err: any) {
    //         const code = err?.errorInfo?.code;

    //         const deadTokenErrors = [
    //             "messaging/registration-token-not-registered",
    //             "messaging/invalid-registration-token",
    //         ];

    //         if (deadTokenErrors.includes(code)) {
    //             console.log("Removing invalid/uninstalled token:", token);

    //             await Users.updateOne(
    //                 { _id: userId },
    //                 { $pull: { fcmTokens: token } }
    //             );
    //         } else {
    //             console.error("Error sending FCM:", code, err);
    //         }
    //     }
    // }

    return new ApiResponse(200, null, "Notification sent");
});

const sendEmailAndNotification = asyncHandler(async (req: RequestUser) => {
    const {
        email,
        userId,
        name,
        title,
        subject,
        content,
        buttonText,
        buttonLink,
        notification,
        notificationTitle,
        notificationDescription,
        notificationType,
        notificationAction,
        notificationActionText,
        notificationSymbol,
    } = req.body;

    const targetUserId: string | undefined = userId || req.user?.userId;

    if (!email && !targetUserId) {
        throw new ApiError("email or userId is required", 400);
    }

    if (targetUserId && !mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw new ApiError("Invalid userId", 400);
    }

    const targetUser = targetUserId ? await Users.findById(targetUserId) : null;

    if (targetUserId && !targetUser) {
        throw new ApiError("User not found", 404);
    }

    const recipientEmail = email || targetUser?.email;
    if (!recipientEmail) {
        throw new ApiError("email is required", 400);
    }

    if (!name || !title || !subject || !content) {
        throw new ApiError("name, title, subject and content are required", 400);
    }

    const notificationPayload = new Notification({
        title: notification?.title ?? notificationTitle ?? title,
        description: notification?.description ?? notificationDescription ?? content,
        type: (notification?.type ?? notificationType ?? "COMMON") as NotificationType,
        action: notification?.action ?? notificationAction ?? "",
        actionText: notification?.actionText ?? notificationActionText ?? "",
        symbol: notification?.symbol ?? notificationSymbol ?? "✉️",
    });

    await EmailQueue.add("CUSTOM_EMAIL_NOTIFICATION", {
        action: notificationPayload.type as NotificationType,
        data: commonTemplate({
            name,
            title,
            content,
            buttonText,
            buttonLink,
        }),
        email: recipientEmail,
        subject,
        notification: notificationPayload,
        userId: targetUserId,
    });

    return new ApiResponse(200, null, "Email queued successfully");
});

export {
  fetchMyNotifications,
  sendNotification,
  sendEmailAndNotification,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  deleteNotification,
};
