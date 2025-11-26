import { streamServerClient } from "../config/getStreamIo.config";

type UserStream = {
  _id: string;
  name: string;
  email: string;
  userRole: string;
};
type UpdateUser = {
  _id: string;
  displayImage: string;
};
type CreateRoomProps = {
  roomName?: string;
  roomId: string;
  members: string[];
  personalName?: any;
  createdBy?: string;
  isCustomer?: boolean;
  room_type: "personal" | "resource";
};
type ProjectRoom = {
  roomName: string;
  roomId: string; // should be a Project._id to be unique
  membersId: string[]; // userId to participate in a chat
  project_id: string;
  relationShipManagerId: string; // staff collection
  org_id: string;
};
type RoomGroupProps = {
  roomId: string;
  roomName: string;
  membersId: string[];
  createdBy: string;
};
export const createUserUpster = async (user: UserStream) => {
  if (!user) throw new Error("User not provided");
  const userExits = await streamServerClient.queryUsers({
    id: (user._id + "") as string,
  });
  if (userExits?.users?.length > 0) return;
  const newUserStream = {
    id: user._id + "",
    role: "user",
    ...user,
  };
  const response = await streamServerClient.upsertUser(newUserStream);
  return response;
};

export const updateuserImage = async (user: UpdateUser) => {
  if (!user) throw new Error("user not provided");

  const updateUser = {
    id: user._id + "",
    set: {
      displayImage: user.displayImage,
    },
  };
  const response = await streamServerClient.partialUpdateUser(updateUser);
  return response;
};
// chat stream name
export const updateuserName = async (user: { name: string; id: string }) => {
  if (!user) throw new Error("user not provided");

  const updateUser = {
    id: user.id + "",
    set: {
      name: user.name,
    },
  };
  const response = await streamServerClient.partialUpdateUser(updateUser);
  return response;
};

// id can be a userid and a orginizationId
export async function createChatRoom(data: CreateRoomProps) {
  try {
    console.log("rooom creting..", data);
    const channel = streamServerClient.channel("messaging", data.roomId, {
      name: data.roomName ?? data.roomId,
      room_type: data.room_type ?? "personal",
      members: data.members,
      isCustomer: true,
      created_by_id: data?.createdBy ?? data.roomId,
    });
    await channel.create();
    console.log("room created ", channel.id);

    return { roomId: channel.id, cid: channel.cid };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
// creating a personal chat
export async function createDistincChatRoom(data: Partial<CreateRoomProps>) {
  try {
    const channel = streamServerClient.channel("messaging", {
      name: data.roomName ?? data.roomId,
      room_type: data.room_type ?? "personal",
      isCustomer: !!data.isCustomer,
      members: data.members,
      created_by_id: data?.createdBy ?? data.roomId,
    });
    await channel.create();

    return { roomId: channel.id, cid: channel.cid };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// Later add members after upserting them
export const addUserToRoom = async (channelId: string, userId: string[]) => {
  const channel = streamServerClient.channel("messaging", channelId);
  // Upsert user before adding to the room
  return await channel.addMembers([...userId]);
};

export const removeUserToRoom = async (channelId: string, userId: string[]) => {
  const channel = streamServerClient.channel("messaging", channelId);
  // Upsert user before adding to the room
  return await channel.removeMembers([...userId]);
};

// this Id is orginizaton and user id
// export const getUserChannels = async (id: string) => {
//   try {
//     // Query for channels where the user is a member
//     const channels = await streamServerClient.queryChannels({
//       members: { $in: [id] } // Filter to find channels where user is a member
//     });

//     return channels;
//   } catch (error) {
//     console.error('Error retrieving user channels:', error);
//   }
// };

// manager can only create a room
export const createRoomForProject = async (data: ProjectRoom) => {
  try {
    const channel = streamServerClient.channel("messaging", data.roomId, {
      name: data.roomName,
      room_type: "group",
      isInternal: false,
      isCustomer: true,
      members: data.membersId,
      project_id: data.project_id,
      orgId: data.org_id,
      created_by_id: data.relationShipManagerId,
    });
    const c = await channel.create();
    return { roomId: channel.id, cid: channel.cid };
  } catch (error) {
    return { error: (error as Error).message };
  }
};
// Creating a group
export const createChatGroup = async (data: RoomGroupProps) => {
  try {
    const channel = streamServerClient.channel("messaging", data.roomId, {
      name: data.roomName,
      room_type: "group",
      members: data.membersId,
      isInternal: true,
      isCustomer: false,
      // project_id: data.project_id,
      created_by_id: data.createdBy,
    });
    const c = await channel.create();
    return { roomId: channel.id, cid: channel.cid };
  } catch (error) {
    return { error: (error as Error).message };
  }
};
