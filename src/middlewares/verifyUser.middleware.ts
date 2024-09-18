import { Request, Response, NextFunction } from "express";
import { JwtPayload, verify } from "jsonwebtoken";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { asyncHandler } from "../utils/asyncHandler";

export const VerifyUserHandler = asyncHandler(async function VerifyUserHandler(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
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
          isVerified: !!verification?.email_verified,
        };
        const getUser = await Users.findOne({
          firebaseId: verification?.uid,
        });
        if (!getUser) {
          throw new ApiError("User not found", 401);
        }
        req.user = { ...getUser.toObject(), userId: getUser?._id?.toString() };
        next();
      }
      //  phle se tha or use kr rhye h userId  confuse na ho jye firebase or iss id me iss liye 
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
})
