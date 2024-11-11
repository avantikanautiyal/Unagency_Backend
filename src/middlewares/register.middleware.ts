import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/apiResponse";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import firebaseAdmin from "../libs/firebase";
import Staff from "../models/staff.model";
export async function RegisterIfNot(
  req: RequestUser,
  response: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers["authorization"];
    const accessToken = authHeader && authHeader.split(" ")[1];
    const verification = await firebaseAdmin
      .auth()
      .verifyIdToken(accessToken!);

    if (verification) {
      const isUserExists = await Users.exists({
        firebaseId: verification?.uid,
      });
      console.log(isUserExists, verification.uid)
      if (!isUserExists) {

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
      }
    }

  } catch (err) {
  } finally {
    next();
  }
}
