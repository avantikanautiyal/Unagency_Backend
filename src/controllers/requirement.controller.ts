import Projects, { IProject } from "../models/projects.model";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import Requirement, { IRequirement } from "../models/requestProject.model";
import mongoose from "mongoose";

// only a customer can create a requirement
export const createRequirement = asyncHandler(async (req: RequestUser, res) => {
  const body: IRequirement = req.body;
  if (!(req.user?.role === "customer"))
    throw new ApiError("Not Authorized", 401);
  if (!body.title && !body.description)
    throw new ApiError("field is missing", 400);
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
  return new ApiResponse(200, newRequirement, "success");
});

export const getCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const requirement = await Requirement.find({
      userId: new mongoose.Types.ObjectId(userId),
    });
    return new ApiResponse(
      200,
      requirement,
      "requirement fetched successfully"
    );
  }
);
