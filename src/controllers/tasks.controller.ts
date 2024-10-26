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


const UpdateTask = asyncHandler(async (req: RequestUser, res: Response) => {
  const { taskId } = req.params; // Task ID from the URL parameters
  const updates: Partial<ITasks> = req.body;      // Fields to be updated

  // Ensure taskId is provided
  if (!taskId) {
    return new ApiResponse(400, null, "Task ID is required");
  }

  // Check if there are any updates in the request body
  if (!updates || Object.keys(updates).length === 0) {
    return new ApiResponse(400, null, "No updates provided");
  }

  try {
    delete updates._id;
    delete updates.assignedTo;
    delete updates.assignedBy;
    delete updates.deadline;
    // Find the task by ID and update it with the new fields
    const updatedTask = await Tasks.findByIdAndUpdate(taskId, updates, {
      new: true, // Return the updated document
      runValidators: true, // Ensure the update complies with schema validation
    }).populate({
      path: 'assignedTo',
      populate: {
        path: 'userId',
        model: 'Users',
      },
    }).populate({
      path: 'assignedBy',
      populate: {
        path: 'userId',
        model: 'Users',
      },
    });

    // Check if the task exists
    if (!updatedTask) {
      return new ApiResponse(404, null, "Task not found");
    }

    return new ApiResponse(200, updatedTask, "Task updated successfully");
  } catch (error) {
    return new ApiResponse(500, null, `Error updating task: ${(error as Error).message}`);
  }
});

/*------- { api for resoruce kanbanboard } ---------*/
const TaskListForResource = asyncHandler(async (req: RequestUser) => {
  let staffId;
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
  if (role !== "resource") {
    return new ApiResponse(403, null, "Unauthorized access");
  }

  // Get the current date and calculate the start (Monday) and end (Sunday) of the week
  const currentDate = new Date();
  const currentDay = currentDate.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday

  // Calculate the date of the last Monday and next Sunday
  const monday = new Date(currentDate);
  monday.setDate(currentDate.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); // If Sunday, subtract 6, else subtract (currentDay - 1)

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6); // Sunday is 6 days after Monday

  // Set the time to the start of the Monday and the end of the Sunday
  monday.setHours(0, 0, 0, 0);
  sunday.setHours(23, 59, 59, 999);

  // Fetch tasks assigned to the staff within the week range
  const query = await Tasks.find({
    assignedTo: staffId,
    createdAt: {
      $gte: monday,
      $lte: sunday,
    },
  })
    .populate({
      path: 'assignedTo',
      populate: {
        path: 'userId',
        model: 'Users',
      },
    })
    .populate({
      path: 'assignedBy',
      populate: {
        path: 'userId',
        model: 'Users',
      },
    });

  return new ApiResponse(200, query, "Weekly Task List found");
});


export { CreateTask, TaskList, UpdateTask, TaskListByUserId, TaskListForResource };
