/**
 * M10.19 — Thin facade over Collaboration OS (replaces GetStream Chatstream).
 * Kept so legacy register/auth/project call sites keep compiling without Stream.
 */

import { collaborationOsService } from "../platform/collaboration/collaboration-os-service";

type UserStream = {
  _id: string;
  name: string;
  email: string;
  userRole: string;
};

/** No-op identity sync — UNAGENCY Users collection is SoT; sockets auth via Firebase. */
export const createUserUpster = async (_user: UserStream) => {
  return { ok: true };
};

export const updateuserImage = async (_user: {
  _id: string;
  displayImage: string;
}) => ({ ok: true });

export const updateuserName = async (_user: { name: string; id: string }) => ({
  ok: true,
});

export async function createChatRoom(data: {
  roomName?: string;
  roomId: string;
  members: string[];
  createdBy?: string;
  room_type?: string;
}) {
  const orgId = data.createdBy || data.members[0] || data.roomId;
  const result = await collaborationOsService.provision({
    entityKind: "support",
    entityId: data.roomId,
    name: data.roomName || data.roomId,
    organizationId: orgId,
    memberUserIds: data.members,
    createdByUserId: data.createdBy || data.members[0],
  });
  return { roomId: result.channelId, cid: `unagency:${result.channelId}` };
}

export async function createDistincChatRoom(data: {
  roomName?: string;
  roomId?: string;
  members?: string[];
  createdBy?: string;
  isCustomer?: boolean;
  room_type?: string;
}) {
  const members = data.members || [];
  const entityId =
    data.roomId ||
    [...members].sort().join("_").slice(0, 48) ||
    `dm_${Date.now()}`;
  const createdBy = data.createdBy || members[0] || entityId;
  const result = await collaborationOsService.provision({
    entityKind: "rm",
    entityId,
    name: data.roomName || "Direct",
    organizationId: createdBy,
    memberUserIds: members,
    createdByUserId: createdBy,
  });
  return { roomId: result.channelId, cid: `unagency:${result.channelId}` };
}

export const addUserToRoom = async (channelId: string, userId: string[]) => {
  const actor = userId[0];
  if (!actor) return;
  await collaborationOsService.addMembers({
    actorUserId: actor,
    channelId,
    memberUserIds: userId,
  });
};

export const removeUserToRoom = async (channelId: string, userId: string[]) => {
  const actor = userId[0];
  if (!actor) return;
  await collaborationOsService.removeMembers({
    actorUserId: actor,
    channelId,
    memberUserIds: userId,
  });
};

export const createRoomForProject = async (data: {
  roomName: string;
  roomId: string;
  membersId: string[];
  project_id: string;
  relationShipManagerId: string;
  org_id: string;
}) => {
  const result = await collaborationOsService.provisionForProject({
    projectId: data.project_id,
    name: data.roomName,
    organizationId: data.org_id || data.relationShipManagerId,
    memberUserIds: data.membersId,
    createdByUserId: data.relationShipManagerId,
  });
  return { roomId: result.channelId, cid: `unagency:${result.channelId}` };
};

export const createChatGroup = async (data: {
  roomId: string;
  roomName: string;
  membersId: string[];
  createdBy: string;
}) => {
  const result = await collaborationOsService.provision({
    entityKind: "team",
    entityId: data.roomId,
    name: data.roomName,
    organizationId: data.createdBy,
    memberUserIds: data.membersId,
    createdByUserId: data.createdBy,
  });
  return { roomId: result.channelId, cid: `unagency:${result.channelId}` };
};
