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
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
const TECH_SUPPORT_EMAIL = process.env.TECH_SUPPORT_EMAIL;
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL || "https://api.unagency.app";
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
              action: "COMMON",
              data: commonTemplate({
                name: verification.name,
                content: "Welcome to UNAGENCY",
                title: "Welcome to UNAGENCY",
              })

              ,
              email: verification?.email!,
              notification: new Notification({
                title: "NEW Rquirement form ",
                description: "requirement notification text here",
                type: "COMMON",
                actionText: "view plans",
                action: "plans.view",
                symbol: "✨",
              }),
              subject: "Hi we will be assigning you a manger soon",
            });
            EmailQueue.add("user not assigned", {
              action: "COMMON",
              data: commonTemplate({
                name: verification.name,
                content: "currently this customer is not assigned to any manager " +
                  verification?.email,
                title: verification?.email + " | Not assigned to any manager",
              }),


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
  // console.log("am here", body.email?.toLowerCase());
  const isUserExists = await Users.exists({ email: body.email?.toLowerCase() });
  if (isUserExists)
    return new ApiResponse(400, null, "User already registered");

  const firebaseUser = await firebaseAdmin.auth().createUser({
    email: body.email?.toLowerCase(),
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

    EmailQueue.add("user register", {
      action: "COMMON",
      data: commonTemplate({
        name: create.name,
        content: "Welcome to UNAGENCY",
        title: "Welcome to UNAGENCY",
      })

      ,
      email: create?.email!,
      notification: new Notification({
        title: "NEW Rquirement form ",
        description: "requirement notification text here",
        type: "COMMON",
        actionText: "view plans",
        action: "plans.view",
        symbol: "✨",
      }),
      subject: "Hi we will be assigning you a manger soon",
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
  } catch (err) {

    console.log("/register-login", err);
  }

  return new ApiResponse(200, null, "you are successfully registered");
});


const logout = asyncHandler(async (req: RequestUser) => {
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

const forgetPassword = asyncHandler(async (req: RequestUser) => {
  const body: { email: string } = req.body;

  if (!body.email) {
    throw new ApiError("User or email not provided", 400);
  }

  const user = await Users.findOne({ email: body.email });
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const passwordResetLink = await firebaseAdmin.auth().generatePasswordResetLink(user?.email!);


  EmailQueue.add("password reset", {
    action: "COMMON",
    data: commonTemplate({
      name: user?.name!,
      content: "by clicking below you can reset your password",
      title: "UNAGENCY",
      buttonText: "reset password",
      buttonLink: passwordResetLink,
    }),
    email: user?.email!,
    notification: new Notification({
      title: "Password Reset",
      description: "your password reset link sent to your email",
      type: "COMMON",
      actionText: "",
      action: "auth.reset-password",
      symbol: "✨",
    }),
    subject: "UNAGENCY |Password Reset ",
  });

  return new ApiResponse(200, { message: "password reset mail sent successfully" }, "Password reset link sent successfully.");
});

const sendEmailVerificationEmail = asyncHandler(async (req: RequestUser) => {
  const body: { email: string } = req.body;

  if (!body.email) {
    throw new ApiError("User or email not provided", 400);
  }

  const user = await Users.findOne({ email: body.email });
  if (!user) {
    throw new ApiError("User not found", 404);
  }
  const uuid = generateRandomString(52);


  user.emailVerificationCode = uuid;
  await user.save();

  EmailQueue.add("Email Verificaiton mail", {
    action: "COMMON",
    data: commonTemplate({
      name: user?.name!,
      content: "by clicking below you can verify your Email with unagency",
      title: "UNAGENCY",
      buttonText: "verify email",
      buttonLink: `${BACKEND_URL}/auth/verify-email?code=${uuid}&id=${user?.firebaseId}`,
    }),
    email: user?.email!,
    notification: new Notification({
      title: "Email verification",
      description: "your email verification link sent to your email",
      type: "COMMON",
      actionText: "",
      action: "auth.reset-password",
      symbol: "✨",
    }),
    subject: "Your UNAGENCY verification mail",
  });

  return new ApiResponse(200, { message: "email verification link sent successfully" }, "email verification link sent successfully.");
});

const verifyEmail = asyncHandler(async (req: RequestUser, res) => {
  const query: { code: string, id: string } = req.query as any;


  if (!query.code) {
    throw new ApiError("code is not present", 400);
  }

  const user = await Users.findOne({ firebaseId: query.id });
  if (!user) {
    throw new ApiError("User not found", 404);
  }

  if (user.emailVerificationCode !== query.code) {
    throw new ApiError("Invalid verification code", 400);
  }

  await firebaseAdmin.auth().updateUser(user?.firebaseId!, {
    emailVerified: true,
  });

  user.emailVerificationCode = "";
  user.isVerified = true;
  await user.save();

  res.redirect(`${FRONTEND_URL}/verify-email?code=${query.code}&id=${query.id}`);
});

function generateRandomString(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export { Verify, Register, NewRegister, logout, registerFcmToken, forgetPassword, verifyEmail, sendEmailVerificationEmail };
