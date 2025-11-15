import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { asyncHandler } from "../utils/asyncHandler";
import StripeCustomers from "../models/customer.model";
import Subscriptions from "../models/subscription.model";
import Organizations, { IOrganization } from "../models/organization.model";
import Staff from "../models/staff.model";

export const VerifyUserHandler = asyncHandler(async function VerifyUserHandler(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader && authHeader.split(" ")[1];
  if (!accessToken) {
    next(new ApiError("No Token Provided", 401));
    return;
  }
  try {
    const verification = await firebaseAdmin.auth().verifyIdToken(accessToken);
    if (verification) {
      const getUser = await Users.findOne({
        firebaseId: verification?.uid,
        // isActive: true,
      });
      let staff;
      if (getUser?.role == "servicing" || getUser?.role == "resource") {
        const checkStaff = await Staff.findOne({ userId: getUser?._id });
        if (checkStaff) {
          staff = checkStaff;
        }
      }
      let organization: IOrganization | null | undefined;
      let customerId, subscriptionId;
      if (getUser?.role == "customer") {
        organization = await Organizations.findOne({
          owner: getUser?._id,
        });


        // inject a user current subscription from here

        // const customer = await StripeCustomers.findOne({
        //   email: verification.email,
        // });
        // if (customer) {
        //   customerId = customer.stripeCustomerId;
        // }
        // const subscription = await Subscriptions.findOne({
        //   customerId: customerId,
        //   status: { $ne: "canceled" },
        // });
        // if (subscription) {
        //   subscriptionId = subscription.subscriptionId;
        // }
      }

      if (!getUser) {
        throw new ApiError("User not found", 401);
      }

      req.user = {
        ...getUser.toObject(),
        isVerified: verification?.email_verified!,
        userId: getUser?._id?.toString(),
        subscriptionId,
        customerId,
        organization: organization as IOrganization,
        staff: staff,
      };
      next();
    }
  } catch (err) {
    next(new ApiError((err as Error).message, 401));
    return;
  }
});

export const VerifyRole = (requiredRoles: string[]) => {
  return asyncHandler(async (req: RequestUser, res, next) => {
    if (requiredRoles.includes(req.user?.role as string)) {
      next();
    } else {
      throw new ApiError("Unauthorized role", 403);
    }
  });
};

export const IsVerifiedUser = asyncHandler(async function IsVerifiedUser(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
  if (req.user?.isVerified) {
    next();
    return;
  }
  const err = new Error("user is not verified");
  next(new ApiError((err as Error).message, 401));
  return;
});
export const IsMembershipUser = asyncHandler(async function IsMembershipUser(
  req: RequestUser,
  res: Response,
  next: NextFunction
) {
  const subscription = await Subscriptions.findOne({
    _id: req.user?.subscriptionId,
  });
  if (subscription?.status == "active") {
    next();
    return;
  }
  const err = new Error("Please activate your membership");
  next(new ApiError((err as Error).message, 400));
  return;
});
