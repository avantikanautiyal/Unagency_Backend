import { Router } from "express";
import {
    getStreamChatToken,
    deleteAllChannels,
    createChannel,
    createChannelTest
} from "../controllers/chat.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.get("/token", VerifyUserHandler, getStreamChatToken);
router.post("/create-channel", VerifyUserHandler, createChannel)
router.get("/deleteAllChannels", deleteAllChannels);
// testing route--------------
router.post("/create-channel-test", createChannelTest)

// router.get("/rooms", getChatRoom);
// router.get("/room/:roomId", getRoomUsers);
// router.post("/create", createChatRoomController);
// router.post("/add", addMemberToRoom);
// router.delete("/remove", removeMemberFromRoom);



export default router;