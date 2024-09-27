import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { createUserUpster, createChatRoom } from "../services/Chatstream";
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
        // Allocate a Relationship manager to a new User
        const isUserExists = await Users.exists({
          firebaseId: verification?.uid,
        });
        if (isUserExists)
          return new ApiResponse(200, null, "user already registered");
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
        ]);
        if (!relationshipManager)
          throw new ApiError("relationship manager not found", 404);
        const user = {
          firebaseId: verification?.uid,
          name: verification?.name,
          role: "customer",
          email: verification?.email,
          isVerified: verification?.email_verified,
          relationship_manager: relationshipManager._id,
        };

        const registration = await Users.create(user);
        if (registration) {
          //  Registring a user to a getStreamId with a mongoDB Id
          const sUser = await createUserUpster({
            _id: registration._id,
            name: registration?.name,
            email: registration.email,
          } as any);

          const roomChannel = await createChatRoom({
            roomId: registration._id + "",
            roomName: `${relationshipManager?.userInfo?.name}, ${registration.name}`,
            members: [
              registration._id + "",
              relationshipManager.userInfo._id + "",
            ],
            createdBy: registration._id + "",
            personalName: {
              [registration._id + ""]: relationshipManager.name,
              [relationshipManager.userInfo._id + ""]: registration.name,
            },
          });
          res
            .status(200)
            .json(
              new ApiResponse(200, registration, "User registered successfully")
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
