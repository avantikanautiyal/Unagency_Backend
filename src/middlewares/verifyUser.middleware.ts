import { Request, Response, NextFunction } from "express";
import { JwtPayload, verify } from "jsonwebtoken";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import mongoose from "mongoose";

interface UserType {
  userId: mongoose.Types.ObjectId;
  firebaseId: string;
  role: string;
  contact: number;
  name: string;
  state: string;
  country: string;
  isVerified: boolean;
  email: string;
}

type RequestUser = Request & {
  user?: UserType;
};

export async function VerifyUserHandler(
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
        const getUser = await Users.findOne({
          firebaseId: verification?.uid,
        });
        req.user = { ...verification?.user, userId: getUser?._id };
        next();
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
}
