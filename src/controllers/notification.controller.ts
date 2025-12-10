import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Notifications from "../models/notification.model";
import { RequestUser } from "../types/user";
import Users from "../models/users.model";
import firebaseAdmin from "../libs/firebase";
const fetchMyNotifications = asyncHandler(async (req: RequestUser) => {
    const notifications = await Notifications.find({
        userId: req.user?.userId
    }).sort({ createdAt: -1 });
    return new ApiResponse(200, notifications, "Notification fetched");
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

export { fetchMyNotifications, sendNotification };
