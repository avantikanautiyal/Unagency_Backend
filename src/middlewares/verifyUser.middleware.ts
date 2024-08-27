import { Request, Response, NextFunction } from "express";
import { JwtPayload, verify } from "jsonwebtoken";
import { ApiError } from "../utils/apiError";

interface UserType {
  id: string;
  name: string;
  email: string;
}
type RequestUser = {
  user: UserType;
} & Request;

export function VerifyUserHandler(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];
  if (accessToken) {
    try {
      const verification = verify(
        accessToken,
        process.env.SERVERTOKEN!
      ) as JwtPayload;
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
