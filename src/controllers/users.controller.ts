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
  };

  try {
    const create = await Users.create(newUser);
    const steramRegister = await createUserUpster({
      _id: create._id + "",
      email,
      name,
    })
    return new ApiResponse(200, create, "User created successfully");
  } catch (err) {
    await firebaseAdmin.auth().deleteUser(firebaseUser.uid);
    console.log("firebase user removed");
    return new ApiResponse(200, err, "Something went wrong");
  }
});

const FetchCustomers = asyncHandler(async (req, res) => {
  const usersList = await Users.find({ role: "customer" });
  return new ApiResponse(200, usersList, "Customer fetched successfully");
});
const FetchInternalTeam = asyncHandler(async (req, res) => {
  const usersList = await Users.find({ role: { $ne: "customer" } });
  return new ApiResponse(200, usersList, "Internal Team fetched successfully");
});
const FetchUserByFirebaseId = asyncHandler(async (req, res) => {
  const user = await Users.find({ firebaseId: req.body.firebaseId });
  return new ApiResponse(200, user, "User fetched successfully");
});

type UpdateUserBody = {
  name: string;
  contact?: number;
  state?: string;
  country?: string;
  image?: string;
}
const UpdateUser = asyncHandler(async (req: RequestUser, res) => {
  const fireBaseId = req.params.firebaseId;
  const updateData: UpdateUserBody = req.body;
  if (req.file) {
    const imageLink: string = (req.file as any).location!
    const uploadedImages = await updateuserImage({
      displayImage: imageLink,
      _id: req?.user?.userId!
    });
    updateData.image = imageLink;
  }

  if ((updateData as any).email) {
    return new ApiResponse(404, null, "Email cannot be updated");
  }
  if ((updateData as any).isVerified) {
    return new ApiResponse(404, null, "Sorry! you cannot update it manually.");
  }
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
// resource
const FetchResource = asyncHandler(async (req, res) => {
  const staffList = await Staff.aggregate([
    {
      $lookup: {
        from: "users", // The Users collection name
        localField: "userId", // Field in Staff
        foreignField: "_id", // Field in Users
        as: "userInfo" // Alias for the joined data
      }
    },
    {
      $unwind: "$userInfo" // Unwind to convert the array into individual documents
    },
    {
      $match: {
        "userInfo.role": "resource" // Filter for users with role "resource"
      }
    },
    {
      $project: {
        _id: 1,
        designation: 1,
        "userInfo.name": 1, // Include the "name" field from Users
        "userInfo._id": 1, // Include the "_id" field from Users
        // Add any other fields from Staff or Users if needed
      }
    }
  ]);

  return new ApiResponse(200, staffList, "resource fetched successfully");
});
export {
  CreateUser,
  FetchCustomers,
  FetchInternalTeam,
  FetchUserByFirebaseId,
  UpdateUser,
  FetchResource
};
