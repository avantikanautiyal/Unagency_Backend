import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { streamServerClient } from "../config/getStreamIo.config";


export const getStreamChatToken = asyncHandler(async (req: RequestUser, res) => {

    console.log(req.user)
    const token = await streamServerClient.createToken(req.user?.userId + ""    );

    return new ApiResponse(200, { token: token, user: req.user }, "success")

})