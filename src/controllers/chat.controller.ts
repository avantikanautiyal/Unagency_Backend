/**
 * Chat / Collaboration OS HTTP surface (M10.19 first-party).
 * Socket.IO handles realtime; HTTP for bootstrap, history, actions.
 */

import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import {
  createDistincChatRoom,
  addUserToRoom,
  removeUserToRoom,
} from "../services/Chatstream";
import Users from "../models/users.model";
import mongoose from "mongoose";
import Staff from "../models/staff.model";
import { ApiError } from "../utils/apiError";
import { collaborationChannelService } from "../services/collaboration/collaboration-channel-service";
import { collaborationActionsService } from "../services/collaboration/collaboration-actions-service";
import { collaborationOsService } from "../platform/collaboration/collaboration-os-service";
import { emitCollaborationEvent } from "../platform/collaboration/socket-gateway";

const template =
  "Hi Team UNAGENCY, I am interested in exploring your {service} services.";

export const getStreamChatToken = asyncHandler(async (req: RequestUser) => {
  const userId = String(req.user?.userId || "");
  if (!userId) throw new ApiError("Unauthorized", 401);

  const issued = await collaborationChannelService.issueToken({
    userId,
    userRole: req.user?.userRole,
    name: (req.user as any)?.name,
    email: (req.user as any)?.email,
  });

  return new ApiResponse(
    200,
    {
      // FE uses Firebase ID token for Socket.IO — this field is a sentinel
      token: "firebase",
      apiKey: issued.apiKey,
      userId: issued.userId,
      role: issued.role,
      transport: issued.transport,
      socketPath: issued.socketPath,
      user: req.user,
    },
    "success"
  );
});

export const listCollaborationChannels = asyncHandler(
  async (req: RequestUser) => {
    const userId = String(req.user?.userId || "");
    const brandId = req.query.brandId ? String(req.query.brandId) : undefined;
    const channels = await collaborationChannelService.listChannelsForUser(
      userId,
      { brandId }
    );
    return new ApiResponse(200, channels, "channels fetched");
  }
);

export const ensureBrandChannel = asyncHandler(async (req: RequestUser) => {
  const userId = String(req.user?.userId || "");
  const brandId = String(req.body?.brandId || "").trim();
  if (!brandId) throw new ApiError("brandId is required", 400);
  const channel = await collaborationChannelService.ensureForBrand({
    userId,
    brandId,
  });
  return new ApiResponse(200, channel, "brand channel ready");
});

export const listChannelMembers = asyncHandler(async (req: RequestUser) => {
  const members = await collaborationChannelService.listMembers({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId || ""),
  });
  return new ApiResponse(200, members, "members fetched");
});

export const listChannelMessages = asyncHandler(async (req: RequestUser) => {
  const messages = await collaborationChannelService.listMessages({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId || ""),
    limit: Number(req.query.limit) || 50,
    parentId: req.query.parentId ? String(req.query.parentId) : undefined,
  });
  return new ApiResponse(200, messages, "messages fetched");
});

export const sendChannelMessage = asyncHandler(async (req: RequestUser) => {
  const userId = String(req.user!.userId);
  const channelId = String(req.params.channelId || "");
  const text = String(req.body?.text || "").trim();
  if (!text) throw new ApiError("text is required", 400);
  const message = await collaborationChannelService.sendMessage({
    userId,
    channelId,
    text,
    messageType: req.body?.messageType || "text",
    parentId: req.body?.parentId,
    assetId: req.body?.assetId,
    artifactId: req.body?.artifactId,
    executionId: req.body?.executionId,
    approvalId: req.body?.approvalId,
    metadata: req.body?.metadata,
  });
  emitCollaborationEvent(message.channelId, "message:new", message as any);
  return new ApiResponse(200, message, "message sent");
});

export const shareAssetInChannel = asyncHandler(async (req: RequestUser) => {
  const message = await collaborationActionsService.shareAsset({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    assetId: String(req.body?.assetId || ""),
    parentId: req.body?.parentId,
  });
  emitCollaborationEvent(message.channelId, "message:new", message as any);
  return new ApiResponse(200, message, "asset shared");
});

export const shareArtifactInChannel = asyncHandler(async (req: RequestUser) => {
  const message = await collaborationActionsService.shareArtifact({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    artifactId: String(req.body?.artifactId || ""),
    executionId: req.body?.executionId,
    label: req.body?.label,
    parentId: req.body?.parentId,
  });
  emitCollaborationEvent(message.channelId, "message:new", message as any);
  return new ApiResponse(200, message, "artifact shared");
});

export const invokeAiInChannel = asyncHandler(async (req: RequestUser) => {
  const result = await collaborationActionsService.invokeAiPlaceholder({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    prompt: String(req.body?.prompt || req.body?.text || ""),
    parentId: req.body?.parentId,
    brandId: req.body?.brandId,
    organizationId: req.body?.organizationId,
  });
  emitCollaborationEvent(
    result.message.channelId,
    "message:new",
    result.message as any
  );
  emitCollaborationEvent(result.message.channelId, "ai:queued", {
    ...result.executionHint,
    messageId: result.message.id,
  });
  return new ApiResponse(200, result, "ai queued via chat");
});

export const postApprovalInChannel = asyncHandler(async (req: RequestUser) => {
  const message = await collaborationActionsService.postApprovalRequest({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    approvalId: String(req.body?.approvalId || ""),
    executionId: req.body?.executionId,
    summary: String(req.body?.summary || "Approval required"),
    parentId: req.body?.parentId,
  });
  emitCollaborationEvent(message.channelId, "message:new", message as any);
  emitCollaborationEvent(message.channelId, "approval:required", {
    approvalId: message.approvalId,
    messageId: message.id,
  });
  return new ApiResponse(200, message, "approval posted");
});

export const postApprovalDecisionInChannel = asyncHandler(
  async (req: RequestUser) => {
    const decision = String(req.body?.decision || "") as
      | "approve"
      | "reject"
      | "resume";
    if (!["approve", "reject", "resume"].includes(decision)) {
      throw new ApiError("decision must be approve|reject|resume", 400);
    }
    const message = await collaborationActionsService.postApprovalDecision({
      userId: String(req.user!.userId),
      channelId: String(req.params.channelId),
      approvalId: String(req.body?.approvalId || ""),
      decision,
      executionId: req.body?.executionId,
      parentId: req.body?.parentId,
      note: req.body?.note,
    });
    emitCollaborationEvent(message.channelId, "message:new", message as any);
    emitCollaborationEvent(message.channelId, `approval:${decision}`, {
      approvalId: message.approvalId,
      messageId: message.id,
    });
    return new ApiResponse(200, message, "approval decision recorded");
  }
);

export const postVoiceInChannel = asyncHandler(async (req: RequestUser) => {
  const message = await collaborationActionsService.postVoiceTranscript({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    transcript: String(req.body?.transcript || req.body?.text || ""),
    assetId: req.body?.assetId,
    parentId: req.body?.parentId,
  });
  emitCollaborationEvent(message.channelId, "message:new", message as any);
  return new ApiResponse(200, message, "voice message posted");
});

export const markChannelRead = asyncHandler(async (req: RequestUser) => {
  await collaborationOsService.markRead({
    userId: String(req.user!.userId),
    channelId: String(req.params.channelId),
    messageId: String(req.body?.messageId || ""),
  });
  return new ApiResponse(200, { ok: true }, "marked read");
});

export const addCollaborationMembers = asyncHandler(async (req: RequestUser) => {
  await collaborationChannelService.addMembers({
    actorUserId: String(req.user!.userId),
    channelId: String(req.params.channelId || req.body?.channelId || ""),
    memberUserIds: Array.isArray(req.body?.members)
      ? req.body.members.map(String)
      : [],
    roles: req.body?.roles,
  });
  return new ApiResponse(200, { ok: true }, "members added");
});

export const removeCollaborationMembers = asyncHandler(
  async (req: RequestUser) => {
    await collaborationChannelService.removeMembers({
      actorUserId: String(req.user!.userId),
      channelId: String(req.params.channelId || req.body?.channelId || ""),
      memberUserIds: Array.isArray(req.body?.members)
        ? req.body.members.map(String)
        : [],
    });
    return new ApiResponse(200, { ok: true }, "members removed");
  }
);

export const createChannel = asyncHandler(async (req: RequestUser) => {
  const userId: string = req.user?.userId!;
  const body: { members: string[]; isCustomer?: boolean } = req.body;
  const list = await Users.find({
    _id: body?.members?.map((m) => new mongoose.Types.ObjectId(m)),
  });
  const room = await createDistincChatRoom({
    roomName: `${list?.map((m) => m.name + " ")}`,
    members: [...(body.members || []), userId],
    createdBy: userId,
    isCustomer: !!body?.isCustomer,
  });
  return new ApiResponse(200, room, "room created");
});

export const getMyRelationShipManagerChat = asyncHandler(
  async (req: RequestUser) => {
    const userId = String(req.user?.userId);
    const staffId = req.user?.relationship_manager;
    const myRelationShipManger = await Staff.findById(staffId);
    if (!myRelationShipManger) {
      return new ApiResponse(
        200,
        null,
        "we will shortly assign you a our service manager"
      );
    }
    const staffUserId = String(myRelationShipManger.userId);
    const provisioned = await collaborationOsService.provision({
      entityKind: "rm",
      entityId: `${userId}_${staffUserId}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48),
      name: "Relationship Manager",
      organizationId: userId,
      memberUserIds: [userId, staffUserId],
      createdByUserId: userId,
    });
    return new ApiResponse(
      200,
      {
        channelId: provisioned.channelId,
        managerUserId: staffUserId,
        name: "Relationship Manager",
        entityKind: "rm",
      },
      "manager chat fetch successfully"
    );
  }
);

export const addMemberInChatRoom = asyncHandler(async (req: RequestUser) => {
  const { cid, members = [] } = req.body;
  await addUserToRoom(cid, [String(req.user!.userId), ...members.map(String)]);
  return new ApiResponse(200, { ok: true }, "member added successfully");
});

export const removeMemberFromChatRoom = asyncHandler(
  async (req: RequestUser) => {
    const { cid, members = [] } = req.body;
    await removeUserToRoom(cid, [
      String(req.user!.userId),
      ...members.map(String),
    ]);
    return new ApiResponse(200, { ok: true }, "member removed successfully");
  }
);

export const sendAutomateMessageToUser = asyncHandler(
  async (req: RequestUser) => {
    const userId = String(req.user?.userId);
    const relationship_manager = req.user?.relationship_manager;
    const staff = await Staff.findById(relationship_manager);
    if (!staff) {
      return new ApiResponse(404, null, "Relationship manager not found");
    }
    const staffUserId = staff.userId.toString();
    if (!matchTemplate(template, String(req.body?.text || ""))) {
      return new ApiResponse(400, null, "Text not matched");
    }
    const room = await collaborationOsService.provision({
      entityKind: "rm",
      entityId: `${userId}_${staffUserId}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48),
      name: "Relationship Manager",
      organizationId: userId,
      memberUserIds: [userId, staffUserId],
      createdByUserId: staffUserId,
    });
    const message = await collaborationOsService.sendMessage({
      userId: staffUserId,
      channelId: room.channelId,
      text: `Welcome to UNAGENCY!\nWe're dialing in the right person for you. Sit tight!`,
      messageType: "system",
    });
    await Users.updateOne(
      { _id: userId },
      { $set: { isfirstMessageSent: true } }
    );
    emitCollaborationEvent(room.channelId, "message:new", message as any);
    return new ApiResponse(200, message, "message sent successfully");
  }
);

function matchTemplate(templateStr: string, input: string): boolean {
  const escapedTemplate = templateStr.replace(/[-\/\\^$+?.()|[\]]/g, "\\$&");
  const regexPattern = escapedTemplate.replace(/\{[^}]+\}/g, "(.+)");
  const regex = new RegExp(`^${regexPattern}$`, "i");
  return regex.test(input);
}
