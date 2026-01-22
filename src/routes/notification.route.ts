import { Router } from "express";
import { fetchMyNotifications, sendEmailAndNotification, sendNotification } from "../controllers/notification.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
const router = Router();
router.get("/",VerifyUserHandler ,fetchMyNotifications);
router.post("/send",VerifyUserHandler ,sendNotification);
router.post("/send/email", sendEmailAndNotification);

export default router;
