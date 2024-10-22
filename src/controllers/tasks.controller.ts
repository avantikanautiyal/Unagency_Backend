import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Tasks, { ITasks } from "../models/tasks.model";
import Staff from "../models/staff.model";
import mongoose from "mongoose";

const CreateTask = asyncHandler(async (req: RequestUser, res: Response) => {
  const {
    project,
    title,
    description,
    priority,
    assignedTo,
    deadline,
  }: ITasks = req.body;
  if (
    !project ||
    !title ||
    !description ||
    !priority ||
    !assignedTo ||
    !deadline
  ) {
    return new ApiResponse(400, null, "All Fields are required");
  }
  let assignedBy;
  if (
    req.user?.staff &&
    typeof req.user.staff === "object" &&
    "_id" in req.user.staff
  ) {
    assignedBy = req.user.staff._id;
  } else {
    return new ApiResponse(400, null, "Invalid Staff ID");
  }
  const assignUserId: string = req.body?.assignedTo as string
  const staff = await Staff.findOne({
    userId: new mongoose.Types.ObjectId(assignUserId),
  });
  if (!staff) return new ApiResponse(400, null, "Invalid assigne Staff ID");

  const create = await Tasks.create({
    ...req.body,
    assignedTo: staff._id,
    assignedBy: req.user?.staff?._id,
  });

  if (create) {
    return new ApiResponse(200, create, "Task assigned successfully");
  }
});

const TaskList = asyncHandler(async (req: RequestUser, res: Response) => {
  let staffId, query;
  if (
    req.user?.staff &&
    typeof req.user.staff === "object" &&
    "_id" in req.user.staff
  ) {
    staffId = req.user.staff._id;
  } else {
    return new ApiResponse(400, null, "Invalid Staff ID");
  }

  const role = req.user?.role;
  if (role == "resource") {
    query = await Tasks.find({ assignedTo: staffId }).populate({
      path: 'assignedTo',
      populate: {
        path: 'userId',
        model: 'Users'
      }
    }).populate({
      path: 'assignedBy',
      populate: {
        path: 'userId',
        model: 'Users'
      }
    });
    // .populate("assignedTo").populate("assignedTo.userId");
  } else if (role == "servicing") {
    query = await Tasks.find({ assignedBy: staffId }).populate({
      path: 'assignedTo',
      populate: {
        path: 'userId',
        model: 'Users'
      }
    }).populate({
      path: 'assignedBy',
      populate: {
        path: 'userId',
        model: 'Users'
      }
    });
  } else {
    query = null;
  }
  return new ApiResponse(200, query, "Task List found");
});

const TaskListByUserId = asyncHandler(async (req: RequestUser) => {
  const { userId } = req.params; // Get staffId from the request parameters
  let query;

  // Validate the staffId
  if (!userId) {
    return new ApiResponse(400, null, "userId ID is required");
  }

  const role = req.user?.role;

  const staff = await Staff.findOne({
    userId: new mongoose.Types.ObjectId(userId),
  })
  if (!staff) return new ApiResponse(400, null, "user is not a staff");

  // Fetch tasks based on user role
  if (role === "resource") {
    query = await Tasks.find({ assignedBy: staff._id });

  } else if (role === "servicing") {
    query = await Tasks.find({ assignedTo: staff._id });

  } else {
    return new ApiResponse(403, null, "Access denied for this role");
  }
  // Return the results
  return new ApiResponse(200, query, "Task List found");
});


const UpdateTask = asyncHandler(async (req: RequestUser, res: Response) => { });

export { CreateTask, TaskList, UpdateTask, TaskListByUserId };
