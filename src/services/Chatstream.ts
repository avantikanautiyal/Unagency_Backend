import { UserType } from '../types/user';

// import { IUser } from '../models/users.model';

import { streamServerClient } from "../config/getStreamIo.config";

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
export async function createChatRoom(id: string, memberIds: string[] = []) {
    // const users = memberIds.map(id => ({ id })); // Map to correct format
    const channel = streamServerClient.channel("messaging", id
        , {
            name: "Prakria Direct",
            members: memberIds,
            created_by_id: id,
        }
    );

    await channel.create();

    return channel;
};

// Later add members after upserting them
export const addUserToRoom = async (channelId: string, userId: string) => {
    const channel = streamServerClient.channel('messaging', channelId);
    // Upsert user before adding to the room
    return await channel.addMembers([userId]);
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

// async function main() {
//     const res = await getUserChannels("66e160775a8bcb018bef3bb7");
//     console.log(res?.length);
//     const re = await addUserToRoom("66e160775a8bcb018bef3bb7", "66e160775a8bcb018bef3bb7");
//     // const room = await createChatRoom("66e160775a8bcb018bef3bb7", ["66e160775a8bcb018bef3bb7"]);
//     // console.log(re);


// }
// main()