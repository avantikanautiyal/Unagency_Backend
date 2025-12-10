import { Router } from "express";
import { fetchMyNotifications, sendNotification } from "../controllers/notification.controller";
const router = Router();
router.get("/", fetchMyNotifications);
router.post("/send", sendNotification);

export default router;
