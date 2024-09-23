import { UserType } from '../types/user';

// import { IUser } from '../models/users.model';

import { streamServerClient } from "../config/getStreamIo.config";
import { ApiError } from '../utils/apiError';
import { ApiResponse } from '../utils/apiResponse';
import Users from '../models/users.model';
import ChatRoom from '../models/chatRoom.model';
import ChatRoomUser from '../models/chatRoomParticipants.model';
import mongoose from 'mongoose';
type UserStream = {
    _id: string,
    name?: string,
    email?: string,
}
export const createUserUpster = async (user: UserStream) => {
    if (!user) throw new Error("user not provided");
    const userExits = await streamServerClient.queryUsers({ id: user._id + "" as string });
    if (userExits?.users?.length > 0) return userExits.users;
    const newUserStream = {
        id: user._id + "",
        ...user,
        role: 'user',
    }
    const response = await streamServerClient.upsertUser(newUserStream);
    return response;
};
// id can be a userid and a orginizationId 

type CreateRoomProps = {
    roomName: string;
    roomId: string;
    members: string[];
    personalName: any;
    createdBy?: string;
}
export async function createChatRoom(data: CreateRoomProps) {
    try {
        const channel = streamServerClient.channel("messaging", data.roomId, {
            name: data.roomName ?? data.roomId,
            room_name: data.personalName,
            members: data.members,
            created_by_id: data?.createdBy ?? data.roomId,
        }
        );
        await channel.create();
        return { roomId: channel.id };
    } catch (error) {
        return { error: (error as Error).name }
    }
};

// Later add members after upserting them
export const addUserToRoom = async (channelId: string, userId: string[]) => {
    const channel = streamServerClient.channel('messaging', channelId);
    // Upsert user before adding to the room
    return await channel.addMembers([...userId]);
};

// this Id is orginizaton and user id 
export const getUserChannels = async (id: string) => {
    try {
        // Query for channels where the user is a member
        const channels = await streamServerClient.queryChannels({
            members: { $in: [id] } // Filter to find channels where user is a member
        });

        return channels;
    } catch (error) {
        console.error('Error retrieving user channels:', error);
    }
};

// type RoomType = "personal" | "group";
// export const assignChatRoomToResourse = async ({ id, clientName = "", type = "personal", roomName = "" }:
//     { id: string, roomName?: string, clientName?: string, type: RoomType }) => {

//     if (!id) throw new ApiError("id is not provided", 401);
//     const [roomChannel] = await streamServerClient.queryChannels({ id: id });
//     if (roomChannel) return { roomId: roomChannel.id };
//     // now create a room here
//     const customerId = id;
//     if (!customerId) throw new ApiError("user not exits", 401);
//     // TODO : add a prakria Relationship manager id here
//     const members = [customerId];
//     const [relationshipManager] = await Users.aggregate(
//         [
//             { $match: { role: "servicing" } },             // Match users with role: "1"
//             { $sample: { size: 1 } }               // Randomly select 1 user
//         ]
//     );
//     if (relationshipManager) members.push(relationshipManager._id + "");

//     const chatroomInstance = new ChatRoom({ chatRoomId: new mongoose.Types.ObjectId(id) });
//     const chatName = type === "personal" ? {
//         [relationshipManager._id + ""]: clientName,
//         [id]: relationshipManager?.name

//     } : { roomName: roomName }
//     const room = await createChatRoom(id, [...members], chatName);
//     await chatroomInstance.save();
//     const chatroomParticipatance = await ChatRoomUser.insertMany(
//         members
//             .map(member => ({ userId: member, chatRoomId: id }))
//     );
//     return { roomId: room.id };
// }


// export const createChatRoom()

type ProjectRoom = {
    roomName: string;
    roomId: string; // should be a Project._id to be unique
    membersId: string[]; // userId to participate in a chat 
    // ownerId: string; // who is creating it 
    relationShipManagerId: string; // staff collection 
}
// manager can only create a room 
export const createRoomForProject = async (data: ProjectRoom) => {
    // TODO : flow to create a project for a ideal conditon 
    try {
        const channel = streamServerClient.channel("messaging", data.roomId, {
            name: data.roomName,
            // room_name: roomName,
            members: data.membersId,
            created_by_id: data.relationShipManagerId,
        }
        );
        const c = await channel.create();
        return { roomId: channel.id };
    } catch (error) {

        return { error: (error as Error).message }
    }
}