import { Router } from "express";
import {
    getStreamChatToken,
    deleteAllChannels,
    createChannel
} from "../controllers/chat.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.get("/token", VerifyUserHandler, getStreamChatToken);
router.post("/create-channel", createChannel)
router.get("/deleteAllChannels", deleteAllChannels);
// router.get("/rooms", getChatRoom);
// router.get("/room/:roomId", getRoomUsers);
// router.post("/create", createChatRoomController);
// router.post("/add", addMemberToRoom);
// router.delete("/remove", removeMemberFromRoom);



export default router;