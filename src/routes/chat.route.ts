import { Router } from "express";
import {
  getStreamChatToken,
  deleteAllChannels,
  createChannel,
  createChannelTest,
} from "../controllers/chat.controller";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";

const router = Router();
// Desc : generating a chat jwt token to use a chat
router.get(
  "/token",
  VerifyRole(["customer", "admin", "servicing", "resource", "superadmin"]),
  getStreamChatToken
);
// Desc : its create a personal chat between two user
router.post(
  "/create-channel",
  VerifyRole(["customer", "admin", "servicing", "resource", "superadmin"]),
  createChannel
);

// testing route--------------
// router.get("/deleteAllChannels", deleteAllChannels);
// router.post("/create-channel-test", createChannelTest);

// router.get("/rooms", getChatRoom);
// router.get("/room/:roomId", getRoomUsers);
// router.post("/create", createChatRoomController);
// router.post("/add", addMemberToRoom);
// router.delete("/remove", removeMemberFromRoom);

export default router;
