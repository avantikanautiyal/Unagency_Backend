import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import Requirement, { IRequirement } from "../models/requestProject.model";
import mongoose from "mongoose";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { Notification } from "../background/utils/notification";
import Staff from "../models/staff.model";

// TESTED OK
export const createRequirement = asyncHandler(async (req: RequestUser, res) => {
  const body: IRequirement = req.body;
  if (!body.title && !body.description)
    throw new ApiError("All fields are required", 400);
  const files = (req.files as any)?.map((file: any) => file.location);
  const requirementBody = {
    title: body.title,
    description: body.description,
    userId: new mongoose.Types.ObjectId(req.user?.userId),
    category: body.category,
    deadline: body.deadline,
    files: files ?? [],
  };
  const newRequirement = await Requirement.create(requirementBody);
  const rm = await Staff.findOne({
    _id: new mongoose.Types.ObjectId(req.user?.relationship_manager + "")
  }
  ).populate("userId");
  projectNotification.add(newRequirement._id.toString(), {
    action: "CREATE",
    data: {
      customer: req.user,
      manager: rm,
      requirment: newRequirement,
    },
    notification: new Notification(newRequirement.title, newRequirement.description, "REQUIRMENT")
  })
  return new ApiResponse(200, newRequirement, "success");
});

// TESTED OK
export const getRequirement = asyncHandler(async (req: RequestUser, res) => {
  const userId: string = req.user?.userId!;
  const requirement = await Requirement.find({
    userId: new mongoose.Types.ObjectId(userId),
  });
  return new ApiResponse(200, requirement, "Requirement fetched successfully");
});

/*------------------------------{ servicing }---------------------------------*/
//TESTED OK
export const getCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const checkMyCustomer = await Users.exists({
      relationship_manager: req.user?.staff,
      _id: userId,
    });

    if (
      !checkMyCustomer &&
      req.user?.role !== "superadmin" &&
      req.user?.role !== "admin"
    ) {
      return new ApiResponse(
        401,
        null,
        "Customer is not associated with your ID"
      );
    }
    const requirement = await Requirement.find({
      userId: new mongoose.Types.ObjectId(userId),
    }).populate("category");
    return new ApiResponse(
      200,
      requirement,
      "Requirement fetched successfully"
    );
  }
);

//TESTED OK
export const updateCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const reqId: string = req.params.reqId;
    const status: string = req.params.status;
    const checkMyCustomer = await Users.exists({
      relationship_manager: req.user?.staff,
      _id: userId,
    });

    if (!checkMyCustomer) {
      return new ApiResponse(
        401,
        null,
        "Customer is not associated with your ID"
      );
    }
    const update = await Requirement.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(reqId), userId: userId },
      { $set: { status: status } },
      { new: true, runValidators: true }
    );
    return new ApiResponse(200, update, "Requirement updated successfully");
  }
);
