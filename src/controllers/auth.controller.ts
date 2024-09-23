import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { createUserUpster, createChatRoom } from "../services/Chatstream";
import { RequestUser, UserType } from "../types/user";
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
        const [relationshipManager] = await Staff.aggregate(
          [
            { $match: { role: "servicing" } },             // Match users with role: "1"
            { $sample: { size: 1 } }               // Randomly select 1 user
          ]
        );
        const user = {
          firebaseId: verification?.uid,
          name: verification?.name,
          role: "customer",
          email: verification?.email,
          isVerified: verification?.email_verified,
          relationship_manager: relationshipManager._id
        };
        const isUserExists = await Users.exists({
          firebaseId: user?.firebaseId,
        });
        if (isUserExists) {
          res
            .status(400)
            .json(new ApiResponse(400, null, "Duplicate entry occured"));
        } else {
          const registration = await Users.create(user);
          if (registration) {
            //  Registring a user to a getStreamId with a mongoDB Id
            const sUser = await createUserUpster({
              _id: registration._id,
              name: registration?.name,
              email: registration.email
            } as any);



            const roomChannel = await createChatRoom({
              roomId: registration._id + "",
              roomName: `${relationshipManager.name}, ${registration.name}`,
              members: [registration._id + "", relationshipManager._id + ""],
              createdBy: registration._id + "",
              personalName: {
                [registration._id + ""]: relationshipManager.name,
                [relationshipManager._id + ""]: registration.name
              }
            })
            // await assignChatRoomToResourse({
            //   id: registration._id + "",
            //   clientName: registration?.name,
            //   type: "personal",
            // })
            // console.log(sUser)
            res
              .status(200)
              .json(
                new ApiResponse(
                  200,
                  registration,
                  "User registered successfully"
                )
              );
          }
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
