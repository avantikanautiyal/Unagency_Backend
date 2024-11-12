import { Router } from "express";
import { fetchMyNotifications } from "../controllers/notification.controller";
const router = Router();
router.get("/", fetchMyNotifications);

export default router;
