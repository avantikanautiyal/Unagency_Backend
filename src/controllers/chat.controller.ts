import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { streamServerClient } from "../config/getStreamIo.config";
import { createChatRoom, addUserToRoom, } from "../services/Chatstream";
import Users from "../models/users.model";
import ChatRoomUser from "../models/chatRoomParticipants.model";
import mongoose from "mongoose";


type CreateRoomBodyType = {
    id: string
}
type ChannelCRUD = {
    channelId: string,
    userId: string,
}
export const getStreamChatToken = asyncHandler(async (req: RequestUser, res) => {
    // console.log(req.user)
    // console.log(req.user);
    const token = streamServerClient.createToken(req.user?.userId + "");
    return new ApiResponse(200, { token: token, user: req.user }, "success")
});

// METHOD = POST
export const createChatRoomController = asyncHandler(async (req: RequestUser, res) => {
    // create a chat room with a Id provied 
    // If a Room exit's return a room id 
    const { id }: CreateRoomBodyType = req.body;
    if (!id) throw new ApiError("id is not provided", 401);
    const [roomChannel] = await streamServerClient.queryChannels({ id: id });
    if (roomChannel) return new ApiResponse(200, { roomId: roomChannel.id }, "room already exits");
    // now create a room here
    const customerId = req.user?.userId;
    if (!customerId) throw new ApiError("user not exits", 401);
    // TODO : add a prakria Relationship manager id here
    const members = [customerId];
    const [relationshipManager] = await Users.aggregate(
        [
            { $match: { role: "servicing" } },             // Match users with role: "1"
            { $sample: { size: 1 } }               // Randomly select 1 user
        ]
    );
    if (relationshipManager) members.push(relationshipManager._id);

    const room = await createChatRoom(id, [...members], req.user?.name);
    // room.sendMessage({
    //     text : "welcome to prakria"
    // })
    return new ApiResponse(200, { roomId: room.id }, "chat room is created");
});

// METHOD = POST
export const addMemberToRoom = asyncHandler(async (req: RequestUser, res) => {
    const { channelId, userId }: ChannelCRUD = req.body;
    if (!channelId && !userId) throw new ApiError("id is not provided", 401);
    const addeduser = await addUserToRoom(channelId, [userId]);
    return new ApiResponse(200, null, "user added in a chat");
});
// METHOD = POST
export const removeMemberFromRoom = asyncHandler(async (req: RequestUser, res) => {
    const { channelId, userId }: ChannelCRUD = req.body;
    if (!channelId && !userId) throw new ApiError("id is not provided", 401);
    return new ApiResponse(501, null, "Not Implemented");
});
export const getChatRoom = asyncHandler(async (req: RequestUser, res) => {
    const rooms = await ChatRoomUser.find({ userId: req.user?.userId }, { chatRoomId: 1 });
    return new ApiResponse(200, rooms, "rooms fetch");
});

export const getRoomUsers = asyncHandler(async (req: RequestUser, res) => {
    const { roomId }: { roomId?: string } = req.params;
    console.log("room ", roomId)
    if (!roomId) throw new ApiError("roomId is not provided", 400);
    const roomUsers = await ChatRoomUser.find({ chatRoomId: new mongoose.Types.ObjectId(roomId) }, { userId: 1 });
    return new ApiResponse(200, roomUsers, "room participants successfully fetched");
});









