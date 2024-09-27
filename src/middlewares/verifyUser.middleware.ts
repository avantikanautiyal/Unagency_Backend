import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { asyncHandler } from "../utils/asyncHandler";
import StripeCustomers from "../models/customer.model";
import Subscriptions from "../models/subscription.model";
import Organizations from "../models/organization.model";

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
        const getUser = await Users.findOne({
          firebaseId: verification?.uid,
        });

        const organization = await Organizations.findOne({
          owner: getUser?._id,
        });

        let customerId, subscriptionId;
        const customer = await StripeCustomers.findOne({
          email: verification.email,
        });
        if (customer) {
          customerId = customer.stripeCustomerId;
        }

        const subscription = await Subscriptions.findOne({
          customerId: customerId,
        });
        if (subscription) {
          subscriptionId = subscription.subscriptionId;
        }

        if (!getUser) {
          throw new ApiError("User not found", 401);
        }

        req.user = {
          ...getUser.toObject(),
          userId: getUser?._id?.toString(),
          subscriptionId,
          customerId,
          organization: organization,
        };
        next();
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
});
