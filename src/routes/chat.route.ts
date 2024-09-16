import { Router } from "express";
import {
    getStreamChatToken,
    createChatRoomController,
    addMemberToRoom,
    removeMemberFromRoom,
    getChatRoom
} from "../controllers/chat.controller";

const router = Router();
router.get("/token", getStreamChatToken);
router.get("/rooms", getChatRoom);
router.post("/create", createChatRoomController);
router.post("/add", addMemberToRoom);
router.delete("/remove", removeMemberFromRoom);


export default router;