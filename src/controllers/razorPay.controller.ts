import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import razorpayInstance from "../utils/razorpayInstance";

// creating a razor-pay subscription 
export const createUserSubscription = asyncHandler(async (req : RequestUser)=>{



    // return new ApiResponse(1,null , "")
})