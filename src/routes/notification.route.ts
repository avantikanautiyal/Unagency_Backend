import { Router } from "express";
import {
  fetchMyNotifications,
  sendEmailAndNotification,
  sendNotification,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  deleteNotification,
  reportClientEvent,
} from "../controllers/notification.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
const router = Router();
router.get("/", VerifyUserHandler, fetchMyNotifications);
router.post("/client-event", VerifyUserHandler, reportClientEvent);
router.post("/read-all", VerifyUserHandler, markAllNotificationsRead);
router.post("/:notificationId/read", VerifyUserHandler, markNotificationRead);
router.post("/:notificationId/archive", VerifyUserHandler, archiveNotification);
router.delete("/:notificationId", VerifyUserHandler, deleteNotification);
router.post("/send", VerifyUserHandler, sendNotification);
router.post("/send/email", sendEmailAndNotification);

export default router;
