import { Router } from "express";
import {
  getStreamChatToken,
  createChannel,
  getMyRelationShipManagerChat,
  addMemberInChatRoom,
  removeMemberFromChatRoom,
  sendAutomateMessageToUser,
  listCollaborationChannels,
  ensureBrandChannel,
  ensureServiceChannel,
  ensureProjectChannel,
  listChannelMembers,
  listChannelMessages,
  sendChannelMessage,
  uploadAttachmentInChannel,
  shareAssetInChannel,
  shareArtifactInChannel,
  invokeAiInChannel,
  postApprovalInChannel,
  postApprovalDecisionInChannel,
  postVoiceInChannel,
  markChannelRead,
  addCollaborationMembers,
  removeCollaborationMembers,
  getServiceAiState,
  patchServiceAiState,
  listServiceAiMessages,
  upsertServiceAiMessage,
  buildServiceExecutionContext,
  resolveServiceConversationalTurn,
  linkServiceExecution,
  clearServiceAiHistory,
} from "../controllers/chat.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";

const router = Router();
const roles = ["customer", "admin", "servicing", "resource", "superadmin"] as const;

router.get("/token", VerifyRole([...roles]), getStreamChatToken);

/** M10.19 — collaboration channels (product-entity scoped) */
router.get("/channels", VerifyRole([...roles]), listCollaborationChannels);
router.post(
  "/ensure-brand-channel",
  VerifyRole([...roles]),
  ensureBrandChannel
);
router.post(
  "/ensure-service-channel",
  VerifyRole([...roles]),
  ensureServiceChannel
);
router.post(
  "/ensure-project-channel",
  VerifyRole([...roles]),
  ensureProjectChannel
);
router.get(
  "/channels/:channelId/members",
  VerifyRole([...roles]),
  listChannelMembers
);
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
  "/channels/:channelId/attachments",
  VerifyRole([...roles]),
  fileUpload.single("file"),
  uploadAttachmentInChannel
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
/** Service AI conversation — persistent context-aware service chat */
router.get(
  "/channels/:channelId/ai-state",
  VerifyRole([...roles]),
  getServiceAiState
);
router.patch(
  "/channels/:channelId/ai-state",
  VerifyRole([...roles]),
  patchServiceAiState
);
router.get(
  "/channels/:channelId/ai-messages",
  VerifyRole([...roles]),
  listServiceAiMessages
);
router.post(
  "/channels/:channelId/ai-messages",
  VerifyRole([...roles]),
  upsertServiceAiMessage
);
router.post(
  "/channels/:channelId/execution-context",
  VerifyRole([...roles]),
  buildServiceExecutionContext
);
router.post(
  "/channels/:channelId/resolve-turn",
  VerifyRole([...roles]),
  resolveServiceConversationalTurn
);
router.post(
  "/channels/:channelId/link-execution",
  VerifyRole([...roles]),
  linkServiceExecution
);
router.delete(
  "/channels/:channelId/ai-history",
  VerifyRole([...roles]),
  clearServiceAiHistory
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
