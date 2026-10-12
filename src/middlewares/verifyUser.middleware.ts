import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { verifyFirebaseIdToken } from "../libs/firebase/verify-id-token";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { asyncHandler } from "../utils/asyncHandler";
import Organizations, { IOrganization } from "../models/organization.model";
import Staff from "../models/staff.model";

const USER_REUSE_MS = 15_000;
const USER_REUSE_MAX = 2_000;

async function lookUpUser(firebaseId: string) {
  const getUser = await Users.findOne({
    firebaseId,
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
  if (getUser?.role == "customer") {
    organization = await Organizations.findOne({
      owner: getUser?._id,
    });
  }
  const lookup = { getUser, staff, organization };
  // Never hold on to "no user" or "customer without an organisation yet":
  // sign-up and business setup must be seen on the very next request.
  if (getUser && (getUser.role !== "customer" || organization)) {
    recentUsers.delete(firebaseId);
    recentUsers.set(firebaseId, { untilMs: Date.now() + USER_REUSE_MS, lookup });
    if (recentUsers.size > USER_REUSE_MAX) {
      const oldest = recentUsers.keys().next().value;
      if (oldest !== undefined) recentUsers.delete(oldest);
    }
  }
  return lookup;
}

const recentUsers = new Map<
  string,
  { untilMs: number; lookup: Awaited<ReturnType<typeof lookUpUser>> }
>();

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
    const verification = await verifyFirebaseIdToken(accessToken);
    if (verification) {
      // The token is verified on every request; only the user / staff /
      // organisation lookups behind it are reused for a few seconds.
      const recent = recentUsers.get(verification.uid);
      const lookup =
        recent && recent.untilMs > Date.now()
          ? recent.lookup
          : await lookUpUser(verification.uid);
      const { getUser, staff, organization } = lookup;
      let customerId;

      if (!getUser) {
        throw new ApiError("User not found", 401);
      }

      req.user = {
        ...getUser.toObject(),
        isVerified: verification.emailVerified ?? false,
        userId: getUser?._id?.toString(),
        customerId,
        organization: organization as IOrganization,
        staff: staff,
      };
      if (getUser.role === "customer" && verification.authTime) {
        void import("../notifications/client-login-notifications")
          .then(({ recordClientLogin }) =>
            recordClientLogin({
              user: getUser.toObject(),
              authTime: verification.authTime,
              signInProvider: verification.signInProvider,
              userAgent: req.headers["user-agent"],
            })
          )
          .catch(() => undefined);
      }
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
  // A user is considered verified if their email is verified OR they signed in
  // via phone (phone number present on the Firebase token means phone was verified).
  const user = req.user;
  if (user?.isVerified) {
    next();
    return;
  }
  // Phone-authenticated users: Firebase sets phoneNumber on the decoded token.
  // The verifyUser middleware stores the raw user object; check contact field as fallback.
  const authHeader = (req as any).headers?.["authorization"] as string | undefined;
  if (authHeader) {
    try {
      const token = authHeader.split(" ")[1];
      if (token) {
        const { verifyFirebaseIdToken } = await import("../libs/firebase/verify-id-token");
        const decoded = await verifyFirebaseIdToken(token);
        if (decoded.phoneNumber) {
          next();
          return;
        }
      }
    } catch {
      // fall through to error below
    }
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
  next(new ApiError("bnd kr diya hai ye change kr ", 400));
});
