import mongoose from "mongoose";
import Users, { IUser } from "../models/users.model";
import { ApiResponse } from "../utils/apiResponse";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";
import firebaseAdmin from "../libs/firebase";
import Staff from "../models/staff.model";
import {
  createDistincChatRoom,
  createUserUpster,
  updateuserImage,
  updateuserName,
} from "../services/Chatstream";
import { RequestUser } from "../types/user";
import StripeCustomers from "../models/customer.model";
import Subscriptions from "../models/subscription.model";
import Invoices from "../models/invoices.model";
import Packages from "../models/packages.model";
import { EmailQueue } from "../background/queue/email.queue";
import { Notification } from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
//TESTED OK = RAHUL
const CreateUser = asyncHandler(async (req, res) => {
  const { email, password, name, role }: IUser = req.body;
  const isExist = await Users.exists({ email: email });
  if (isExist) {
    return new ApiResponse(409, null, "User already exists");
  }
  const firebaseUser = await firebaseAdmin.auth().createUser({
    email,
    password,
    displayName: name,
    emailVerified: true,  // Mark the user as verified at creation
  });
  const newUser: IUser = {
    _id: new mongoose.Types.ObjectId(),
    firebaseId: firebaseUser.uid,
    name,
    email,
    role,
    isVerified: firebaseUser?.emailVerified,
    isActive: true,
  };
  //User create in Database
  try {
    const create = await Users.create(newUser);
    await createUserUpster({
      _id: create._id + "",
      email,
      name,
      userRole: create.role,
    });
    return new ApiResponse(200, create, "User created successfully");
  } catch (err) {
    await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
    return new ApiResponse(500, err, "Something went wrong");
  }
});

// TESTED OK , TODO : user profile bug
const UpdateUser = asyncHandler(async (req: RequestUser, res) => {
  const fireBaseId = req.user?.firebaseId as string;
  const updateData: Partial<IUser> = req.body;
  if (req.file) {
    const imageLink: string = (req.file as any).location!;
    // update image at chat server
    if (imageLink) {
      await updateuserImage({
        displayImage: imageLink,
        _id: req?.user?.userId!,
      });
      updateData.image = imageLink;
    } else {
      delete updateData.image;
    }
  }
  if ((updateData as any).email) {
    return new ApiResponse(400, null, "Email cannot be updated");
  }

  if ((updateData as any).isVerified) {
    return new ApiResponse(400, null, "Sorry! you cannot update it manually.");
  }

  if (updateData?.name) {
    await firebaseAdmin.auth().updateUser(fireBaseId, {
      displayName: updateData.name,
    });
    await updateuserName({ name: updateData.name, id: req?.user?.userId! });
  }
  const updatedUser = await Users.findOneAndUpdate(
    { firebaseId: fireBaseId },
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!updatedUser) {
    return new ApiResponse(404, null, "User not found");
  }
  return new ApiResponse(200, updatedUser, "User Data updated");
});

//TESTED OK = RAHUL
const UpdateInternalUser = asyncHandler(async (req: RequestUser, res) => {
  const body: Partial<IUser> = req.body;
  const update = await Users.findByIdAndUpdate(
    body?._id,
    { $set: body },
    { new: true, runValidators: true }
  );
  if (!update) {
    return new ApiResponse(404, null, "User not found");
  }
  return new ApiResponse(200, update, "User Data updated");
});

//TESTED OK = RAHUL
const FetchCustomers = asyncHandler(async (req: RequestUser, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const searchText = req.query.search as string;
  const skip = (page - 1) * limit;

  let query: any = {};

  if (req.user?.role == "superadmin" || req.user?.role == "admin") {
    query = {
      role: "customer",
    };
  } else {
    query = {
      role: "customer",
      relationship_manager: req.user?.staff,
    };
  }

  if (searchText) {
    query.$or = [
      { name: { $regex: searchText, $options: "i" } },
      { email: { $regex: searchText, $options: "i" } },
    ];
  }

  const total = await Users.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  const usersList = await Users.find(query)
    .populate({
      path: "relationship_manager",
      select: "userId",
      populate: { path: "userId", select: ["name", "email"] },
    })
    .skip(skip)
    .limit(limit);

  return new ApiResponse(
    200,
    {
      users: usersList,
      pagination: {
        total,
        page,
        pageSize: limit,
        totalPages,
      },
    },
    "Customer fetched successfully"
  );
});

//TESTED OK = RAHUL
const FetchCustomerById = asyncHandler(async (req, res) => {
  const customer = await Users.findOne({
    role: "customer",
    _id: req.params.customer,
  }).populate({
    path: "relationship_manager",
    select: "userId",
    populate: { path: "userId", select: ["name", "email"] },
  });
  return new ApiResponse(200, customer, "Customer fetched successfully");
});

//TESTED OK = RAHUL
const FetchCustomerPlan = asyncHandler(async (req, res) => {
  const customer = await Users.findOne({
    role: "customer",
    _id: req.params.customer,
  });

  if (!customer) return new ApiResponse(200, null, "Customer not found");

  const stripe_customer = await StripeCustomers.findOne({
    email: customer?.email,
  });

  if (!stripe_customer)
    return new ApiResponse(200, null, "Stripe Customer not found");

  const subscription = await Subscriptions.find({
    customerId: stripe_customer?.stripeCustomerId,
  }).sort({ createdAt: -1 });

  const currentSubscription = await Subscriptions.findOne({
    customerId: stripe_customer?.stripeCustomerId,
    status: "active",
  });

  const invoice = await Invoices.find({
    customerId: stripe_customer?.stripeCustomerId,
  }).sort({ createdAt: -1 });

  const plan = await Packages.findOne({
    duration: {
      $elemMatch: {
        stripe_price_id: currentSubscription?.planId,
      },
    },
  });

  return new ApiResponse(
    200,
    {
      subscription: subscription,
      currentSubscription: currentSubscription,
      currentPlan: plan,
      invoice: invoice,
    },
    "Customer Plan fetched successfully"
  );
});
//TESTED OK = RAHUL
const FetchResource = asyncHandler(async (req, res) => {
  const staffList = await Staff.aggregate([
    {
      $lookup: {
        from: "users", // The Users collection name
        localField: "userId", // Field in Staff
        foreignField: "_id", // Field in Users
        as: "userInfo", // Alias for the joined data
      },
    },
    {
      $unwind: "$userInfo",
    },
    {
      $match: {
        "userInfo.role": "resource",
      },
    },
    {
      $project: {
        _id: 1,
        designation: 1,
        "userInfo.name": 1,
        "userInfo._id": 1,
      },
    },
  ]);
  return new ApiResponse(200, staffList, "Resource fetched successfully");
});
//TESTED OK = RAHUL
const FetchInternalTeam = asyncHandler(async (req, res) => {
  const usersList = await Users.find({
    role: { $nin: ["customer", "superadmin"] },
  }).sort({
    createdAt: -1,
  });
  return new ApiResponse(200, usersList, "Internal Team fetched successfully");
});
//TESTED OK = RAHUL
const SearchUsersInChat = asyncHandler(async (req: RequestUser) => {
  const userId: string = req.user?.userId!;
  const { query } = req.body;
  if (!query) return new ApiResponse(200, [], "search results");

  const users = await Users.find({
    _id: { $ne: new mongoose.Types.ObjectId(userId) },
    name: new RegExp(query, "i"),
    role: { $in: ["resource", "servicing"] },
  });
  return new ApiResponse(200, users, "search result found");
});
//TESTED OK = SOURABH
const DisableUser = asyncHandler(async (req, res) => {
  const firebaseId = req.params.firebaseID;
  const disable = await firebaseAdmin.auth().updateUser(firebaseId, {
    disabled: true,
  });
  if (!disable) {
    return new ApiResponse(
      200,
      null,
      "There was an issue while disabling user account"
    );
  }
  const update = await Users.findOneAndUpdate(
    { firebaseId: firebaseId },
    { $set: { isActive: false } },
    { new: true, runValidators: true }
  );
  if (!update) {
    return new ApiResponse(
      400,
      null,
      "There was an issue while disabling user account"
    );
  }
  return new ApiResponse(200, null, "User disabled");
});
//TESTED OK = SOURABH
const EnableUser = asyncHandler(async (req, res) => {
  const firebaseId = req.params.firebaseID;
  const enable = await firebaseAdmin.auth().updateUser(firebaseId, {
    disabled: false,
  });
  if (!enable) {
    return new ApiResponse(
      200,
      null,
      "There was an issue while enabling user account"
    );
  }
  const update = await Users.findOneAndUpdate(
    { firebaseId: firebaseId },
    { $set: { isActive: true } },
    { new: true, runValidators: true }
  );
  if (!update) {
    return new ApiResponse(
      200,
      null,
      "There was an issue while enabling user account"
    );
  }
  return new ApiResponse(200, null, "User Enabled");
});
const FetchUserById = asyncHandler(async (req, res) => {
  const user = await Users.findOne(
    { _id: req.params.id },
    { email: 1, name: 1, role: 1 }
  );
  return new ApiResponse(200, user, "User fetched successfully");
});

//TESTED OK
const UpdateTourCompletion = asyncHandler(async (req: RequestUser, res) => {
  const user = req.user;
  const body: { tourCompleted: "incomplete" | "complete" | "skipped" } = req.body;

  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const validStates = ["incomplete", "complete", "skipped"];
  if (!body.tourCompleted || !validStates.includes(body.tourCompleted)) {
    throw new ApiError("tourCompleted must be one of: incomplete, complete, skipped", 400);
  }

  // Fetch current user to check previous tour completion status
  const currentUser = await Users.findById(user.userId);
  if (!currentUser) {
    throw new ApiError("User not found", 404);
  }

  const previousTourState = currentUser.tourCompleted || "incomplete";

  const updatedUser = await Users.findOneAndUpdate(
    { _id: user.userId },
    { $set: { tourCompleted: body.tourCompleted } },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    throw new ApiError("User not found", 404);
  }

  // Send email when tour is newly completed (was not complete, now complete)
  if (body.tourCompleted === "complete" && previousTourState !== "complete") {
    EmailQueue.add("tour completion", {
      action: "COMMON",
      data: commonTemplate({
        name: updatedUser.name,
        content: "Tour's done, setup's complete, now it's your turn. Start your first project and see how fast things move here.",
        title: "UNAGENCY",
        buttonText: "Start Creating",
        buttonLink: `${process.env.FRONTEND_URL}`,
      }),
      email: updatedUser.email,
      userId: updatedUser._id + "",
      notification: new Notification({
        title: "You're all set. Let's make something epic.",
        description: "You've successfully completed the app tour. Start exploring UNAGENCY now!",
        type: "PROJECT",
        actionText: "start proejct",
        action: "/",
        symbol: "🎉",
      }),
      subject: "You've unlocked your UNAGENCY workspace.",
    });
  }

  // Send email when tour is skipped
  if (body.tourCompleted === "skipped") {
    EmailQueue.add("tour skipped", {
      action: "COMMON",
      data: commonTemplate({
        name: updatedUser.name,
        content: "You skipped the tour (no pressure). When you're ready, hit restart, we'll guide you through like a pro.",
        title: "Skip today, tour tomorrow.",
        buttonText: "Start Creating",
        buttonLink: `${process.env.FRONTEND_URL}`,
      }),
      email: updatedUser.email,
      userId: updatedUser._id + "",
      notification: new Notification({
        title: "No problem. You can always come back later.",
        description: "You skipped the tour (no pressure). When you're ready, hit restart, we'll guide you through like a pro.",
        type: "PROJECT",
        actionText: "start proejct",
        action: "/",
        symbol: "👋",
      }),
      subject: "Skip today, tour tomorrow.",
    });
  }

  return new ApiResponse(
    200,
    { tourCompleted: updatedUser.tourCompleted },
    "Tour completion status updated successfully"
  );
});

export {
  CreateUser,
  FetchCustomers,
  FetchInternalTeam,
  FetchUserById,
  UpdateUser,
  FetchResource,
  DisableUser,
  EnableUser,
  UpdateInternalUser,
  SearchUsersInChat,
  FetchCustomerById,
  FetchCustomerPlan,
  UpdateTourCompletion,
};
