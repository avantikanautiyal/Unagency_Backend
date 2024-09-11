import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { streamServerClient } from "../config/getStreamIo.config";

// const createChatRoom = asyncHandler(async (req: RequestUser, res) => {
//     if (!req.user) throw new ApiError("no user found", 404);


//     streamServerClient.channel("messaging", { name: "asd" })

//     const isExits = await streamServerClient.queryUsers({ id: req?.user.userId + "" });
//     if (isExits) {
//         return new ApiResponse(200, isExits, "user already exits");
//     }
//     const user = {
//         id: req?.user.userId + "",
//         ...req.user,
//         role: 'admin',
//     }
//     const response = await streamServerClient.upsertUser(user);
//     return new ApiResponse(200, response, "user created");
// });
// export { createUseratStreamIo };
