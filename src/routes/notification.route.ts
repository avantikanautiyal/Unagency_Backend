import { Router } from "express";
import {
  fetchMyNotifications,
  sendEmailAndNotification,
  sendNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notification.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
const router = Router();
router.get("/", VerifyUserHandler, fetchMyNotifications);
router.post("/read-all", VerifyUserHandler, markAllNotificationsRead);
router.post("/:notificationId/read", VerifyUserHandler, markNotificationRead);
router.post("/send", VerifyUserHandler, sendNotification);
router.post("/send/email", sendEmailAndNotification);

export default router;
