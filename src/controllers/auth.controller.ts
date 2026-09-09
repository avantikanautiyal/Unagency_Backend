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
import { NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { parseNotificationContent } from "../utils/notificationUtils";
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
            _id: registration._id + "",
            name: registration?.name,
            email: registration.email,
            userRole: registration.role,
          } as any); // Registring Get Stream IO User

          if (!relationshipManager) {
            const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.FIRST_LOGIN.email_body, { Name: verification.name || "User" });
            EmailQueue.add("user register", {
              action: "COMMON",
              data: commonTemplate({
                name: verification.name,
                content: notificationData.text,
                title: NOTIFICATION_CONFIG.FIRST_LOGIN.email_subject,
                buttonText: notificationData.cta,
                buttonLink: `${FRONTEND_URL}`, // As per "Start Tour" or Dashboard
                showFeatures: true
              })

              ,
              email: verification?.email!,
              notification: new Notification({
                title: NOTIFICATION_CONFIG.FIRST_LOGIN.in_app_title.replace("[Name]", verification.name || "User"),
                description: NOTIFICATION_CONFIG.FIRST_LOGIN.in_app_body,
                type: "COMMON",
                actionText: "view plans",
                action: "/membership",
                symbol: "✨",
              }),
              subject: NOTIFICATION_CONFIG.FIRST_LOGIN.email_subject.replace("[Name]", verification.name || "User"),
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
                action: "/messages",
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

    const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.FIRST_LOGIN.email_body, { Name: create.name || "User" });
    EmailQueue.add("user register", {
      action: "COMMON",
      data: commonTemplate({
        name: create.name,
        content: notificationData.text,
        title: NOTIFICATION_CONFIG.FIRST_LOGIN.email_subject.replace("[Name]", create.name || "User"),
        buttonText: notificationData.cta,
        buttonLink: `${FRONTEND_URL}`,
        showFeatures: true
      })

      ,
      email: create?.email!,
      notification: new Notification({
        title: NOTIFICATION_CONFIG.FIRST_LOGIN.in_app_title.replace("[Name]", create.name || "User"),
        description: NOTIFICATION_CONFIG.FIRST_LOGIN.in_app_body,
        type: "COMMON",
        actionText: "view plans",
        action: "/membership",
        symbol: "✨",
      }),
      subject: NOTIFICATION_CONFIG.FIRST_LOGIN.email_subject.replace("[Name]", create.name || "User"),
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
            action: "/messages",
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

  if (!FRONTEND_URL) {
    throw new ApiError(
      "FRONTEND_URL is not configured on the server; cannot generate password reset redirect URL",
      500
    );
  }

  // Firebase Admin always generates a Firebase-hosted action link.
  // To send a "your website" link, extract the oobCode and build a frontend URL instead.
  const actionCodeSettings = {
    url: `${FRONTEND_URL}/reset-password`,
    handleCodeInApp: false,
  };

  const firebaseActionLink = await firebaseAdmin
    .auth()
    .generatePasswordResetLink(user.email!, actionCodeSettings as any);

  let passwordResetLink = firebaseActionLink;
  try {
    const u = new URL(firebaseActionLink);
    const oobCode = u.searchParams.get("oobCode");
    if (oobCode) {
      const frontendUrl = new URL(`${FRONTEND_URL}/reset-password`);
      frontendUrl.searchParams.set("oobCode", oobCode);
      // optional: keep mode for clarity on the frontend
      frontendUrl.searchParams.set("mode", "resetPassword");
      passwordResetLink = frontendUrl.toString();
    }
  } catch {
    // fallback to firebaseActionLink
  }
  const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.email_body, { Name: user?.name || "User" });
  EmailQueue.add("password reset", {
    action: "COMMON",
    data: commonTemplate({
      name: user?.name!,
      content: notificationData.text,
      title: NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.email_subject,
      buttonText: notificationData.cta || "Reset Password",
      buttonLink: passwordResetLink,
    }),
    email: user?.email!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.in_app_title,
      description: NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.in_app_body,
      type: "COMMON",
      actionText: "",
      action: "auth.reset-password",
      symbol: "✨",
    }),
    subject: NOTIFICATION_CONFIG.PASSWORD_RESET_REQUESTED.email_subject.replace("[Name]", user?.name || "User"), // Though subject in config doesn't have [Name] but safeguard
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

  const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.EMAIL_VERIFICATION_REQUIRED.email_body, { Name: user?.name || "User" });
  EmailQueue.add("Email Verificaiton mail", {
    action: "COMMON",
    data: commonTemplate({
      name: user?.name!,
      content: notificationData.text,
      title: NOTIFICATION_CONFIG.EMAIL_VERIFICATION_REQUIRED.email_subject,
      buttonText: notificationData.cta || "Verify Email",
      buttonLink: `${BACKEND_URL}/auth/verify-email?code=${uuid}&id=${user?.firebaseId}`,
    }),
    email: user?.email!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.EMAIL_VERIFICATION_REQUIRED.in_app_title,
      description: NOTIFICATION_CONFIG.EMAIL_VERIFICATION_REQUIRED.in_app_body,
      type: "COMMON",
      actionText: "",
      action: "/profile",
      symbol: "✨",
    }),
    subject: NOTIFICATION_CONFIG.EMAIL_VERIFICATION_REQUIRED.email_subject,
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

  const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.EMAIL_VERIFIED.email_body, { Name: user?.name || "User" });
  EmailQueue.add("Email Verificaiton mail", {
    action: "COMMON",
    data: commonTemplate({
      name: user?.name!,
      content: notificationData.text,
      title: NOTIFICATION_CONFIG.EMAIL_VERIFIED.email_subject,
      buttonText: notificationData.cta,
      buttonLink: `${FRONTEND_URL}`
    }),
    email: user?.email!,
    userId: user._id + "",
    notification: new Notification({
      title: NOTIFICATION_CONFIG.EMAIL_VERIFIED.in_app_title,
      description: NOTIFICATION_CONFIG.EMAIL_VERIFIED.in_app_body,
      type: "COMMON",
      actionText: "",
      action: "/profile",
      symbol: "✨",
    }),
    subject: NOTIFICATION_CONFIG.EMAIL_VERIFIED.email_subject,
  });

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

function generateNumericOtp(length = 6) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

// ---------------------------------------------------------------------------
// In-memory phone OTP store (phone → { otp, expiresAt, attempts })
// For production replace with Redis or a dedicated OTP model.
// ---------------------------------------------------------------------------
interface PhoneOtpEntry {
  otp: string;
  expiresAt: number; // Date.now() ms
  attempts: number;
}
const phoneOtpStore = new Map<string, PhoneOtpEntry>();
const PHONE_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

/**
 * POST /auth/send-phone-otp
 * Body: { phone: string }   (e.g. "+919876543210")
 * Generates a 6-digit OTP, stores it server-side, and creates a Firebase
 * custom token.  The client must use Firebase's signInWithCustomToken
 * after server validation (see POST /auth/verify-phone-otp).
 *
 * NOTE: Actual SMS delivery requires an SMS provider (Twilio, MSG91, etc.).
 * Add your provider call where the TODO comment is below.
 */
const sendPhoneOtp = asyncHandler(async (req) => {
  const body: { phone?: string } = req.body;
  const phone = body.phone?.trim();

  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new ApiError("A valid E.164 phone number is required (e.g. +919876543210)", 400);
  }

  // Rate-limit: if an un-expired OTP already exists, re-use it to avoid spam.
  const existing = phoneOtpStore.get(phone);
  const otp =
    existing && existing.expiresAt > Date.now()
      ? existing.otp
      : generateNumericOtp(6);

  phoneOtpStore.set(phone, {
    otp,
    expiresAt: Date.now() + PHONE_OTP_TTL_MS,
    attempts: 0,
  });

  // TODO: Send `otp` via your SMS provider here, e.g.:
  //   await smsClient.send({ to: phone, body: `Your UNAGENCY code is ${otp}` });
  //
  // In development the OTP is returned in the response so you can test without SMS.
  const isDev = process.env.NODE_ENV !== "production";

  return new ApiResponse(
    200,
    isDev ? { otp } : {},
    "OTP sent successfully"
  );
});

/**
 * POST /auth/verify-phone-otp
 * Body: { phone: string, otp: string }
 * Validates the OTP then returns a Firebase custom token so the client can
 * call signInWithCustomToken(auth, customToken) client-side.
 */
const verifyPhoneOtp = asyncHandler(async (req) => {
  const body: { phone?: string; otp?: string } = req.body;
  const phone = body.phone?.trim();
  const otp = body.otp?.trim();

  if (!phone || !otp) {
    throw new ApiError("phone and otp are required", 400);
  }

  const entry = phoneOtpStore.get(phone);
  if (!entry) {
    throw new ApiError("No OTP was sent to this number. Please request a new code.", 404);
  }
  if (entry.expiresAt < Date.now()) {
    phoneOtpStore.delete(phone);
    throw new ApiError("OTP has expired. Please request a new code.", 410);
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    phoneOtpStore.delete(phone);
    throw new ApiError("Too many failed attempts. Please request a new code.", 429);
  }

  entry.attempts += 1;
  if (entry.otp !== otp) {
    phoneOtpStore.set(phone, entry);
    throw new ApiError("Invalid OTP. Please try again.", 400);
  }

  // OTP valid — clean up
  phoneOtpStore.delete(phone);

  // Look up or provision a Firebase user for this phone number.
  // Firebase Admin lets us look up by phone or create a new account.
  let firebaseUid: string;
  try {
    const existing = await firebaseAdmin.auth().getUserByPhoneNumber(phone);
    firebaseUid = existing.uid;
  } catch {
    // User doesn't exist — create a minimal phone-only account.
    const created = await firebaseAdmin.auth().createUser({ phoneNumber: phone });
    firebaseUid = created.uid;
  }

  // Issue a custom token — the client exchanges this for an ID token.
  const customToken = await firebaseAdmin.auth().createCustomToken(firebaseUid, {
    phone_verified: true,
  });

  return new ApiResponse(200, { customToken }, "OTP verified successfully");
});

/**
 * POST /auth/send-email-magic-link
 * Body: { email: string }
 * Generates a Firebase email sign-in link (magic link) and sends it via the
 * existing EmailQueue so styling is consistent.
 */
const sendEmailMagicLink = asyncHandler(async (req) => {
  const body: { email?: string } = req.body;
  const email = body.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError("A valid email address is required", 400);
  }

  const continueUrl = `${FRONTEND_URL}/email-verify?email=${encodeURIComponent(email)}`;

  const actionCodeSettings = {
    url: continueUrl,
    handleCodeInApp: true,
  };

  const link = await firebaseAdmin.auth().generateSignInWithEmailLink(email, actionCodeSettings);

  // Send via the email queue for consistent branding.
  EmailQueue.add("email magic link", {
    action: "COMMON",
    data: commonTemplate({
      name: email.split("@")[0],
      content: "Click the button below to sign in to your UNAGENCY account. This link expires in 1 hour.",
      title: "Sign in to UNAGENCY",
      buttonText: "Sign In",
      buttonLink: link,
    }),
    email,
    notification: new Notification({
      title: "Sign-in link sent",
      description: "Check your email inbox for your UNAGENCY sign-in link.",
      type: "COMMON",
      actionText: "",
      action: "/profile",
      symbol: "✉️",
    }),
    subject: "Your UNAGENCY sign-in link",
  });

  return new ApiResponse(200, {}, "Sign-in link sent to your email");
});

export {
  Verify,
  Register,
  NewRegister,
  logout,
  registerFcmToken,
  forgetPassword,
  verifyEmail,
  sendEmailVerificationEmail,
  sendPhoneOtp,
  verifyPhoneOtp,
  sendEmailMagicLink,
};
