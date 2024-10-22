import Users from "../models/users.model";
import { createChatRoom } from "../services/Chatstream";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";


type CreateResouseChatBody = {
    memberId: string
}
// POST
export const createResourseChat = asyncHandler(async (req: RequestUser) => {
    const userId = req?.user?.userId;
    const body: CreateResouseChatBody = req.body;

    const member = await Users.findById(body.memberId);
    if (!member) throw new ApiError("invalid member id", 400);

    const roomChannel = await createChatRoom({
        roomId: userId + "",
        roomName: `${req?.user?.name}`,
        members: [
            userId + "",
            body.memberId,
        ],
        createdBy: userId + "",
        room_type: "resource",
        personalName: {
            [userId + ""]: member?.name,
            [member._id + ""]: req?.user?.name,
            resourseName: req?.user?.name,
            relationshipManagerName: member?.name,
        },
    });
    return new ApiResponse(200, roomChannel, "chat successfully created")
});
// GET
export const getInternalUserList = asyncHandler(async (req: RequestUser) => {
    const { searchTerm } = req.query;

    if (!searchTerm) return new ApiResponse(200, [], "search result");
    const users = await Users.find({
        name: { $regex: searchTerm, $options: 'i' }, // Case-insensitive search
        role: { $in: ["servicing", "resource"] }

    });
    return new ApiResponse(200, users, "search result");
});