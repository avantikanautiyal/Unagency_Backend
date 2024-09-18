import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { assignChatRoomToResourse, createUserUpster } from "../services/Chatstream"
import { RequestUser, UserType } from "../types/user";
const Verify = asyncHandler(async (req: RequestUser, res) => {

  console.log("verify ", req.user)
  return new ApiResponse(200, req.user);
  // const authHeader = req.headers["authorization"];
  // const accessToken = authHeader && authHeader.split(" ")[1];
  // if (accessToken) {
  //   try {
  //     const verification = await firebaseAdmin
  //       .auth()
  //       .verifyIdToken(accessToken);
  //     if (verification) {
  //       res.status(200).json(new ApiResponse(200, verification, "Verified"));
  //     }
  //   } catch (err) {
  //     throw new ApiError((err as Error).message, 401);
  //   }
  // } else {
  //   throw new ApiError("No Token Provided", 401);
  // }
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
        const user = {
          firebaseId: verification?.uid,
          name: verification?.name,
          role: "customer",
          email: verification?.email,
          isVerified: verification?.email_verified,
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
            await assignChatRoomToResourse({ id: registration._id + "", roomName: registration?.name })
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
