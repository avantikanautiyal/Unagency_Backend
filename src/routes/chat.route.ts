import { Router } from "express";
import {
  getStreamChatToken,
  createChannel,
  getMyRelationShipManagerChat,
  addMemberInChatRoom,
  removeMemberFromChatRoom,
  sendAutomateMessageToUser,
  listCollaborationChannels,
  listChannelMessages,
  sendChannelMessage,
  shareAssetInChannel,
  shareArtifactInChannel,
  invokeAiInChannel,
  postApprovalInChannel,
  postApprovalDecisionInChannel,
  postVoiceInChannel,
  markChannelRead,
  addCollaborationMembers,
  removeCollaborationMembers,
} from "../controllers/chat.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
const roles = ["customer", "admin", "servicing", "resource", "superadmin"] as const;

router.get("/token", VerifyRole([...roles]), getStreamChatToken);

/** M10.19 — collaboration channels (product-entity scoped) */
router.get("/channels", VerifyRole([...roles]), listCollaborationChannels);
router.get(
  "/channels/:channelId/messages",
  VerifyRole([...roles]),
  listChannelMessages
);
router.post(
  "/channels/:channelId/messages",
  VerifyRole([...roles]),
  sendChannelMessage
);
router.post(
  "/channels/:channelId/share-asset",
  VerifyRole([...roles]),
  shareAssetInChannel
);
router.post(
  "/channels/:channelId/share-artifact",
  VerifyRole([...roles]),
  shareArtifactInChannel
);
router.post(
  "/channels/:channelId/ai",
  VerifyRole([...roles]),
  invokeAiInChannel
);
router.post(
  "/channels/:channelId/approvals",
  VerifyRole([...roles]),
  postApprovalInChannel
);
router.post(
  "/channels/:channelId/approvals/decision",
  VerifyRole([...roles]),
  postApprovalDecisionInChannel
);
router.post(
  "/channels/:channelId/voice",
  VerifyRole([...roles]),
  postVoiceInChannel
);
router.post(
  "/channels/:channelId/read",
  VerifyRole([...roles]),
  markChannelRead
);
router.post(
  "/channels/:channelId/members",
  VerifyRole([...roles]),
  addCollaborationMembers
);
router.delete(
  "/channels/:channelId/members",
  VerifyRole([...roles]),
  removeCollaborationMembers
);

router.post("/create-channel", VerifyRole([...roles]), createChannel);
router.get("/myRMChat", VerifyRole(["customer"]), getMyRelationShipManagerChat);
router.post(
  "/add-member-in-chat-room",
  VerifyRole(["servicing", "customer"]),
  addMemberInChatRoom
);
router.post(
  "/remove-member-from-chat-room",
  VerifyRole(["servicing", "customer"]),
  removeMemberFromChatRoom
);
router.post(
  "/send-automate-message",
  VerifyRole(["customer"]),
  sendAutomateMessageToUser
);

export default router;
