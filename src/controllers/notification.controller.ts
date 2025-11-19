import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Notifications from "../models/notification.model";
import { RequestUser } from "../types/user";
const fetchMyNotifications = asyncHandler(async (req: RequestUser) => {
    const notifications = await Notifications.find({
        userId: req.user?.userId
    }).sort({ createdAt: -1 });
    return new ApiResponse(200, notifications, "Notification fetched");
});

export { fetchMyNotifications };
