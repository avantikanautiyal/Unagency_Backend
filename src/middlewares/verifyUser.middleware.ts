import { Request, Response, NextFunction } from "express";
import { JwtPayload, verify } from "jsonwebtoken";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";

interface UserType {
  id: string;
  name: string;
  email: string;
}
type RequestUser = {
  user: UserType;
} & Request;

export async function VerifyUserHandler(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];
  if (accessToken) {
    try {
      const verification = await firebaseAdmin.auth().verifyIdToken(accessToken);
      if (verification) {
        req.user = verification?.user;
        next();
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
}
