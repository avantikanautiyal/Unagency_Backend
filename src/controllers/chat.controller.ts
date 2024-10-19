import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { v6 as uuidv6 } from "uuid"
import { RequestUser } from "../types/user";
import { streamServerClient } from "../config/getStreamIo.config";
import { createChatRoom, createDistincChatRoom } from "../services/Chatstream";

import ChatRoom from "../models/chatRoom.model";
import Users from "../models/users.model";
import mongoose from "mongoose";

export const getStreamChatToken = asyncHandler(async (req: RequestUser, res) => {
    // console.log(req.user)
    // console.log(req.user);
    const token = streamServerClient.createToken(req.user?.userId + "");
    return new ApiResponse(200, { token: token, user: req.user }, "success")
});
//------------------------------------------------------------------------------------------

// post
export const createChannel = asyncHandler(async (req: RequestUser) => {
    const userId: string = req.user?.userId!;
    const body: { members: string[], room_type: "personal" | "group" } = req.body;
    const list = await Users.find({ _id: body?.members?.map(m => new mongoose.Types.ObjectId(m)) })
    const room = await createDistincChatRoom({
        roomName: `${list?.map(m => m.name + " ")}`,
        members: [...body.members, userId],
        room_type: "personal",
        createdBy: userId,
        // body.room_type as "personal" ?? "personal",
    });
    console.log("room=>", room)


    const dbRoom = await ChatRoom.findOneAndUpdate(
        {
            cid: room.cid,
            roomId: room.roomId,
        }, // Query to find the document by _id
        {
            $setOnInsert: {
                cid: room.cid,
                roomId: room.roomId,
                members: body.members
            }
        },
        {
            upsert: true,
            returnDocument: 'after'  // Return the updated document (set to 'before' for the original)

        } // Ensure the document is inserted if it does not exist
    );
    // const dbRoom = await ChatRoom.create({
    //     cid: room.cid,
    //     roomId: room.roomId,
    //     members: body.members
    // });


    return new ApiResponse(200, room, "room created")

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









