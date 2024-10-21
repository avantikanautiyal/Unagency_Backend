import mongoose from "mongoose";
import Users, { IUser } from "../models/users.model";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import firebaseAdmin from "../libs/firebase";
import Staff from "../models/staff.model";
import { createUserUpster, updateuserImage } from "../services/Chatstream";
import { RequestUser } from "../types/user";

const CreateUser = asyncHandler(async (req, res) => {
  const { email, password, name, role } = req.body;
  const isExist = await Users.exists({ email: email });
  if (isExist) {
    return new ApiResponse(409, null, "User already exists");
  }

  const firebaseUser = await firebaseAdmin.auth().createUser({
    email,
    password,
    displayName: name,
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

  try {
    const create = await Users.create(newUser);
    const steramRegister = await createUserUpster({
      _id: create._id + "",
      email,
      name,
    });
    return new ApiResponse(200, create, "User created successfully");
  } catch (err) {
    await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
    console.log("firebase user removed");
    return new ApiResponse(200, err, "Something went wrong");
  }
});
const FetchCustomers = asyncHandler(async (req, res) => {
  const usersList = await Users.find({ role: "customer" }).populate({
    path: "relationship_manager",
    select: "userId",
    populate: { path: "userId", select: ["name", "email"] },
  });
  return new ApiResponse(200, usersList, "Customer fetched successfully");
});
const FetchCustomerById = asyncHandler(async (req, res) => {
  const usersList = await Users.find({
    role: "customer",
    _id: req.params.customer,
  }).populate({
    path: "relationship_manager",
    select: "userId",
    populate: { path: "userId", select: ["name", "email"] },
  });
  return new ApiResponse(200, usersList, "Customer fetched successfully");
});
const FetchInternalTeam = asyncHandler(async (req, res) => {
  const usersList = await Users.find({
    role: { $nin: ["customer", "superadmin"] },
  }).sort({
    createdAt: -1,
  });
  return new ApiResponse(200, usersList, "Internal Team fetched successfully");
});
const FetchUserById = asyncHandler(async (req, res) => {
  const user = await Users.find(
    { firebaseId: req.params.id },
    { email: 1, name: 1, role: 1 }
  );
  return new ApiResponse(200, user, "User fetched successfully");
});
const UpdateUser = asyncHandler(async (req: RequestUser, res) => {
  const fireBaseId = req.user?.firebaseId as string;
  const updateData: Partial<IUser> = req.body;
  if (req.file) {
    const imageLink: string = (req.file as any).location!;
    await updateuserImage({
      displayImage: imageLink,
      _id: req?.user?.userId!,
    });
    updateData.image = imageLink;
  }
  if ((updateData as any).email) {
    return new ApiResponse(400, null, "Email cannot be updated");
  }

  if ((updateData as any).isVerified) {
    return new ApiResponse(400, null, "Sorry! you cannot update it manually.");
  }

  if (updateData?.name)
    await firebaseAdmin.auth().updateUser(fireBaseId, {
      displayName: updateData.name,
    });

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
      $unwind: "$userInfo", // Unwind to convert the array into individual documents
    },
    {
      $match: {
        "userInfo.role": "resource", // Filter for users with role "resource"
      },
    },
    {
      $project: {
        _id: 1,
        designation: 1,
        "userInfo.name": 1, // Include the "name" field from Users
        "userInfo._id": 1, // Include the "_id" field from Users
        // Add any other fields from Staff or Users if needed
      },
    },
  ]);

  return new ApiResponse(200, staffList, "resource fetched successfully");
});
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
      200,
      null,
      "There was an issue while disabling user account"
    );
  }
  return new ApiResponse(200, null, "User disabled");
});
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
  FetchCustomerById,
};
