import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import {
  createUserUpster,
  createDistincChatRoom,
} from "../services/Chatstream";
import { RequestUser } from "../types/user";
import Staff from "../models/staff.model";
const Verify = asyncHandler(async (req: RequestUser, res) => {
  return new ApiResponse(200, req.user);
});

const Register = asyncHandler(async (req, res) => {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];
  if (accessToken) {
    try {
      const verification = await firebaseAdmin
        .auth()
        .verifyIdToken(accessToken);
      if (verification) {
        const isUserExists = await Users.exists({
          firebaseId: verification?.uid,
        });
        if (isUserExists)
          return new ApiResponse(200, null, "User already registered");
        const [relationshipManager] = await Staff.aggregate([
          {
            $lookup: {
              from: "users", // The name of the collection you're joining
              localField: "userId", // The field in Staff collection
              foreignField: "_id", // The field in the Users collection to match
              as: "userInfo", // The name of the output array field
            },
          },
          { $unwind: "$userInfo" },
          {
            $match: {
              "userInfo.role": "servicing",
            },
          },
          { $sample: { size: 1 } },
        ]); // Allocate a Relationship manager to a new User
        const user = {
          firebaseId: verification?.uid,
          name: verification?.name,
          role: "customer",
          email: verification?.email,
          isVerified: verification?.email_verified,
          relationship_manager: relationshipManager
            ? relationshipManager._id
            : null,
        };

        const registration = await Users.create(user); // Creating user in database
        if (registration) {
          await createUserUpster({
            _id: registration._id,
            name: registration?.name,
            email: registration.email,
            userRole: registration.role,
          } as any); // Registring Get Stream IO User

          if (!relationshipManager)
            return new ApiResponse(
              200,
              registration,
              "User registered successfully"
            );

          await createDistincChatRoom({
            roomName: `${relationshipManager?.userInfo?.name}, ${registration.name}`,
            members: [
              registration._id + "",
              relationshipManager.userInfo._id + "",
            ],
            createdBy: registration._id + "",
            room_type: "personal",
            isCustomer: true,
          }); //CReating a Channel between Customer and Relationship Manager

          return new ApiResponse(
            200,
            registration,
            "User registered successfully"
          );
        }
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
});

export { Verify, Register };
