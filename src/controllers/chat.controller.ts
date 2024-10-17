import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { v6 as uuidv6 } from "uuid"
import { RequestUser } from "../types/user";
import { streamServerClient } from "../config/getStreamIo.config";
import { createChatRoom } from "../services/Chatstream";

import ChatRoom from "../models/chatRoom.model";

export const getStreamChatToken = asyncHandler(async (req: RequestUser, res) => {
    // console.log(req.user)
    // console.log(req.user);
    const token = streamServerClient.createToken(req.user?.userId + "");
    return new ApiResponse(200, { token: token, user: req.user }, "success")
});
//------------------------------------------------------------------------------------------

// post
export const createChannel = asyncHandler(async (req: RequestUser) => {
    const body: { members: string[], room_type: "personal" | "group" } = req.body;
    const room = await createChatRoom({
        roomId: uuidv6(),
        members: body.members ?? [],
        room_type: body.room_type as "personal" ?? "personal",
    });

    const dbRoom = await ChatRoom.create({
        cid: room.cid,
        roomId: room.roomId,
        members: body.members
    });

    return new ApiResponse(200, dbRoom, "room created")

});
export const deleteChannel = asyncHandler(async (req: RequestUser) => {
    const { cid } = req.body;
    await streamServerClient.deleteChannels([cid], { hard_delete: true });
    return new ApiResponse(200, null, "all channels deleted")
});
export const deleteAllChannels = asyncHandler(async (req: RequestUser) => {
    const allChannels = await streamServerClient.queryChannels({});
    const channelIds = allChannels.map(c => c.cid);
    console.log(channelIds)
    await streamServerClient.deleteChannels(channelIds, { hard_delete: true });
    return new ApiResponse(200, null, "all channels deleted")
});









