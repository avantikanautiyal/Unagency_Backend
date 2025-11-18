import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import firebaseAdmin from "../libs/firebase";
import Users from "../models/users.model";
import {
  createUserUpster,
  createDistincChatRoom,
} from "../services/Chatstream";
import { RequestUser } from "../types/user";
import Staff from "../models/staff.model";
import { EmailQueue } from "../background/queue/email.queue";
import { Notification } from "../background/utils/notification";
const TECH_SUPPORT_EMAIL = process.env.TECH_SUPPORT_EMAIL;
//TESTED OK = RAHUL
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
        const isUserExists = await Users.exists({
          firebaseId: verification?.uid,
        });
        if (isUserExists)
          return new ApiResponse(200, null, "User already registered");
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
        if (registration) {
          await createUserUpster({
            _id: registration._id,
            name: registration?.name,
            email: registration.email,
            userRole: registration.role,
          } as any); // Registring Get Stream IO User

          if (!relationshipManager) {
            EmailQueue.add("user register", {
              action: "REQUIRMENT",
              data: "NEW Rquirement form  ",
              email: verification?.email!,
              notification: new Notification({
                title: "NEW Rquirement form ",
                description: "requirement notification text here",
                type: "REQUIRMENT",
                actionText: "view requirment",
                action: "requirment.view",
                symbol: "✨",
              }),
              subject: "Hi we will be assigning you a manger soon",
            });
            EmailQueue.add("user not assigned", {
              action: "COMMON",
              data:
                "currently this customer is not assigned to any manager " +
                verification?.email,
              email: TECH_SUPPORT_EMAIL!,
              notification: new Notification({
                title: "Not assigned to any manager",
                description: "not assignet to any tech supprot",
                type: "COMMON",
                symbol: "📣",
                action: "message.start",
                actionText: "contact us",
              }) as any,
              subject:
                "CUSTOMER NOT ASSIGNED TO ANY MANAGER " + verification.email,
            });
            return new ApiResponse(
              200,
              registration,
              "User registered successfully"
            );
          }

          await createDistincChatRoom({
            roomName: `${relationshipManager?.userInfo?.name}, ${registration.name}`,
            members: [
              registration._id + "",
              relationshipManager.userInfo._id + "",
            ],
            createdBy: registration._id + "",
            room_type: "personal",
            isCustomer: true,
          }); //CReating a Channel between Customer and Relationship Manager

          return new ApiResponse(
            200,
            registration,
            "User registered successfully"
          );
        }
      }
    } catch (err) {
      throw new ApiError((err as Error).message, 401);
    }
  } else {
    throw new ApiError("No Token Provided", 401);
  }
});

type RegisterBody = {
  name: string;
  email: string;
  password: string;
};
const NewRegister = asyncHandler(async (req) => {
  const body: RegisterBody = req.body;
  if (!(body.email && body.name && body.password))
    throw new ApiError("all fields are required", 400);
  const isUserExists = await Users.exists({ email: body.email });
  if (isUserExists)
    return new ApiResponse(200, null, "User already registered");

  const firebaseUser = await firebaseAdmin.auth().createUser({
    email: body.email,
    password: body.password,
    displayName: body.name,
  });
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
    firebaseId: firebaseUser?.uid,
    name: body.name,
    role: "customer",
    email: firebaseUser?.email,
    isVerified: firebaseUser?.emailVerified,
    relationship_manager: relationshipManager ? relationshipManager._id : null,
  };
  try {
    // saving user in mongo db and a chatstream io server
    const create = await Users.create(user);
    await createUserUpster({
      _id: create._id + "",
      email: body.email,
      name: body.name,
      userRole: create.role,
    });

    if (!relationshipManager) {
      EmailQueue.add("we will assign", {
        action: "REQUIRMENT",
        data: "NEW Rquirement form  ",
        email: create?.email!,
        notification: new Notification({
          title: "NEW Rquirement form ",
          description: "requirement notification text here",
          type: "REQUIRMENT",
          symbol: "🎁",
          action: "requirment.open",
          actionText: "view requirment",
        }) as any,
        subject: "Hi we will be assigning you a manger soon",
      });
      EmailQueue.add("user not assigned", {
        action: "COMMON",
        data:
          "currently this customer is not assigned to any manager " +
          create?.email,
        email: TECH_SUPPORT_EMAIL!,
        notification: new Notification(
          {
            title: "Not assigned to any manager",
            description: "not assigned to any tech support",
            type: "COMMON",
            action: "message.open",
            actionText: "contact us",
            symbol: "🔔" // generated symbol for notification
          }
        ),
        subject: "CUSTOMER NOT ASSIGNED TO ANY MANAGER " + create.email,
      });

      return new ApiResponse(200, create, "User registered successfully");
    }

    await createDistincChatRoom({
      roomName: `${relationshipManager?.userInfo?.name}, ${create.name}`,
      members: [create._id + "", relationshipManager.userInfo._id + ""],
      createdBy: create._id + "",
      room_type: "personal",
      isCustomer: true,
    }); //CReating a Channel between Customer and Relationship Manager

    return new ApiResponse(200, create, "User created successfully");
  } catch (err) {}

  return new ApiResponse(200, null, "you are successfully registered");
});
const logout = asyncHandler(async (req : RequestUser) => {
  const user = req.user;
  const body: { fcmToken: string } = req.body;

  if (!user || !body.fcmToken) {
    throw new ApiError("User or fcmToken not provided", 400);
  }

 const res = await Users.updateOne(
    { _id: user.userId },
    { $pull: { fcmTokens: body.fcmToken } }
  );

  return new ApiResponse(200, res, "Successfully logged out and fcmToken removed.");
});
const registerFcmToken = asyncHandler(async (req: RequestUser) => {
  const user = req.user;
  const body: { fcmToken: string } = req.body;

  if (!user || !body.fcmToken) {
    throw new ApiError("User or fcmToken not provided", 400);
  }

  const updated = await Users.updateOne(
    { _id: user.userId },
    { $addToSet: { fcmTokens: body.fcmToken } }
  );

  return new ApiResponse(200, updated, "FCM token registered successfully.");
});

export { Verify, Register, NewRegister , logout ,registerFcmToken  };
