import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { v6 as uuidv6 } from "uuid";
import { RequestUser } from "../types/user";
import { streamServerClient } from "../config/getStreamIo.config";
import { createChatRoom, createDistincChatRoom, addUserToRoom, removeUserToRoom } from "../services/Chatstream";

import ChatRoom from "../models/chatRoom.model";
import Users from "../models/users.model";
import mongoose from "mongoose";
import Staff from "../models/staff.model";

const template =
  "Hi Team UNAGENCY, I am interested in exploring your {service} services.";
//  TESTED OK
export const getStreamChatToken = asyncHandler(
  async (req: RequestUser, res) => {
    // console.log(req.user)
    // console.log(req.user);
    const token = streamServerClient.createToken(req.user?.userId + "");
    return new ApiResponse(200, { token: token, user: req.user }, "success");
  }
);
//  TESTED OK
export const createChannel = asyncHandler(async (req: RequestUser) => {
  const userId: string = req.user?.userId!;
  const body: {
    members: string[];
    room_type: "personal" | "group";
    isCustomer: boolean;
  } = req.body;
  const list = await Users.find({
    _id: body?.members?.map((m) => new mongoose.Types.ObjectId(m)),
  });
  const room = await createDistincChatRoom({
    roomName: `${list?.map((m) => m.name + " ")}`,
    members: [...body.members, userId],
    room_type: "personal",
    createdBy: userId,
    isCustomer: !!body?.isCustomer,
  });

  const dbRoom = await ChatRoom.findOneAndUpdate(
    {
      cid: room.cid,
      roomId: room.roomId,
    }, // Query to find the document by _id
    {
      $setOnInsert: {
        cid: room.cid,
        roomId: room.roomId,
        members: body.members,
      },
    },
    {
      upsert: true,
      returnDocument: "after", // Return the updated document (set to 'before' for the original)
    } // Ensure the document is inserted if it does not exist
  );

  return new ApiResponse(200, room, "room created");
});
//------------------------------------------------------------------------------------------
// TAPI
export const deleteChannel = asyncHandler(async (req: RequestUser) => {
  const { cid } = req.body;
  await streamServerClient.deleteChannels([cid], { hard_delete: true });
  return new ApiResponse(200, null, "all channels deleted");
});
// TAPI

export const deleteAllChannels = asyncHandler(async (req: RequestUser) => {
  const allChannels = await streamServerClient.queryChannels({});
  const channelIds = allChannels.map((c) => c.cid);
  console.log(channelIds);
  await streamServerClient.deleteChannels(channelIds, { hard_delete: true });
  return new ApiResponse(200, null, "all channels deleted");
});


// it will give me a chatroomId of my personal assigned manager
export const getMyRelationShipManagerChat = asyncHandler(async (req: RequestUser) => {
  const userId = req.user?.userId!
  const staffId = req.user?.relationship_manager;
  const myRelationShipManger = await Staff.findById(staffId);

  if (!myRelationShipManger) return new ApiResponse(200, null, "we will shortly assign you a our service manager");
  const channels = await streamServerClient.queryChannels({
    type: 'messaging',
    members: [userId?.toString(), myRelationShipManger?.userId?.toString()]
  })
  return new ApiResponse(
    200,
    {
      channelId: channels[0]?.id,
      managerUserId: myRelationShipManger?.userId,
    },
    "manager chat fetch successfully"
  );

});



export const addMemberInChatRoom = asyncHandler(async (req: RequestUser) => {
  const { cid, members = [] } = req.body;
  console.log("members=>", members);
  const channelResponse = await addUserToRoom(cid, [...members]);
  return new ApiResponse(200, channelResponse, "member added successfully");
});
export const removeMemberFromChatRoom = asyncHandler(async (req: RequestUser) => {
  const { cid, members = [] } = req.body;
  console.log("members=>", members);
  const channelResponse = await removeUserToRoom(cid, [...members]);
  return new ApiResponse(200, channelResponse, "member added successfully");
});


//------- api end point to send automate message to user
export const sendAutomateMessageToUser = asyncHandler(async (req: RequestUser) => {
  const userId = req.user?.userId!;

  const relationship_manager = req.user?.relationship_manager!;
  const staff = await Staff.findById(relationship_manager);

  if (!staff) {
    return new ApiResponse(404, null, "Relationship manager not found");
  }

  const staffUserId = staff.userId.toString();

  const isTextMatched = matchTemplate(template, req.body.text);
  if (!isTextMatched) {
    return new ApiResponse(400, null, "Text not matched");
  }
  // Create or get a distinct channel where both users are members
  const channel = streamServerClient.channel('messaging', {
    members: [userId, staffUserId],
  });

  await channel.create();

  const messageSendResponse = await channel.sendMessage({
    text: `Welcome to UNAGENCY!
We’re dialing in the right person for you. Sit tight!`,
    user_id: staffUserId, // must be a real user
  });

  await Users.updateOne({ _id: userId }, { $set: { isfirstMessageSent: true } });

  return new ApiResponse(200, messageSendResponse, "message sent successfully");
});

//-----------------------{testing room create api}--------------------
// remove in production
// TAPI
export const createChannelTest = asyncHandler(async (req: RequestUser) => {
  // const userId: string = req.user?.userId!;
  const body: {
    members: string[];
    room_type: "personal" | "group";
    isCustomer: boolean;
  } = req.body;
  const list = await Users.find({
    _id: body?.members?.map((m) => new mongoose.Types.ObjectId(m)),
  });
  const room = await createDistincChatRoom({
    roomName: `${list?.map((m) => m.name + " ")}`,
    members: [...body.members],
    room_type: "personal",
    createdBy: body.members[0],
    isCustomer: !!body?.isCustomer,
    // body.room_type as "personal" ?? "personal",
  });
  console.log("room=>", room);

  const dbRoom = await ChatRoom.findOneAndUpdate(
    {
      cid: room.cid,
      roomId: room.roomId,
    }, // Query to find the document by _id
    {
      $setOnInsert: {
        cid: room.cid,
        roomId: room.roomId,
        members: body.members,
      },
    },
    {
      upsert: true,
      returnDocument: "after", // Return the updated document (set to 'before' for the original)
    } // Ensure the document is inserted if it does not exist
  );
  // const dbRoom = await ChatRoom.create({
  //     cid: room.cid,
  //     roomId: room.roomId,
  //     members: body.members
  // });

  return new ApiResponse(200, room, "room created");
});


function matchTemplate(
  template: string,
  input: string
): boolean {
  // Escape regex special characters except {}
  const escapedTemplate = template.replace(
    /[-\/\\^$+?.()|[\]]/g,
    "\\$&"
  );

  // Convert {placeholder} → regex group (matches words & spaces)
  const regexPattern = escapedTemplate.replace(
    /\{[^}]+\}/g,
    "(.+)"
  );

  const regex = new RegExp(`^${regexPattern}$`, "i");
  return regex.test(input);
}
