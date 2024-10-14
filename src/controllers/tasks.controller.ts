import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Tasks, { ITasks } from "../models/tasks.model";

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

  const create = await Tasks.create({
    ...req.body,
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
    query = await Tasks.find({ assignedTo: staffId });
  } else if (role == "servicing") {
    query = await Tasks.find({ assignedBy: staffId });
  } else {
    query = null;
  }
  return new ApiResponse(200, query, "Task List found");
});

const UpdateTask = asyncHandler(async (req: RequestUser, res: Response) => {});

export { CreateTask, TaskList, UpdateTask };
