import { Router } from "express";
import { getStreamChatToken } from "../controllers/chat.controller";
const router = Router();
router.get("/token", getStreamChatToken);
export default router;