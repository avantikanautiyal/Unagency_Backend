import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Tasks, { ITasks } from "../models/tasks.model";
import Staff from "../models/staff.model";
import mongoose from "mongoose";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { Notification } from "../background/utils/notification";
import { EmailQueue } from "../background/queue/email.queue";
import { sendNotificationFCM } from "../utils/FCM";

// TESTED OK
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
  const assignUserId: string = req.body?.assignedTo as string;
  const staff = await Staff.findOne({
    userId: new mongoose.Types.ObjectId(assignUserId),
  }).populate("userId");
  if (!staff) return new ApiResponse(400, null, "Invalid resource Staff ID");

  const create = await Tasks.create({
    ...req.body,
    assignedTo: staff._id,
    assignedBy: req.user?.staff?._id,
  });

  // await projectNotification.add(create?._id?.toString(), {
  //   action: "ASSIGN",
  //   data: {
  //     status: create?.status,
  //     userId: staff?.userId?._id,
  //     emails: [(staff?.userId as any)?.email],
  //     name: (staff.userId as any).name,
  //     deadline: create.deadline,
  //     assignedBy: req?.user?.name,
  //   },
  //   notification: new Notification({
  //     title: create.title,
  //     description: create.description,
  //     type: "TASK",
  //     action: "task.open",
  //     actionText: "view task",
  //     symbol: "👨🏽‍💻",
  //   }),
  // });

  EmailQueue.add("task creation", {
    action: "TASK",
    data: "NEW Task creation here " + create.title + " " + create.description,
    email: (staff?.userId as any)?.email!,
    userId: staff?.userId?._id.toString(),
    notification: new Notification({
      title: create.title,
      description: create.description,
      type: "TASK",
      action: "task.open",
      actionText: "view task",
      symbol: "👨🏽‍💻",
    }),
    subject: "New Task has been created",
  });
  // currently sending a notificaiton to only a owner
  await sendNotificationFCM({
    notification: new Notification({
      title: create.title,
      description: create.description,
      type: "TASK",
      action: "task.open",
      actionText: "view task",
      symbol: "🍾",
    }),
    user: staff?.userId as any,
  });

  return new ApiResponse(200, create, "Task assigned successfully");
});
// TESTED OK
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
    query = await Tasks.find({ assignedTo: staffId })
      .populate({
        path: "assignedTo",
        select: "userId",
        populate: {
          path: "userId",
          model: "Users",
          select: "name email",
        },
      })
      .populate({
        path: "assignedBy",
        select: "userId",
        populate: {
          path: "userId",
          model: "Users",
          select: "name email",
        },
      });
  } else if (role == "servicing") {
    query = await Tasks.find({ assignedBy: staffId })
      .populate({
        path: "assignedTo",
        select: "userId",
        populate: {
          path: "userId",
          model: "Users",
          select: "name email",
        },
      })
      .populate({
        path: "assignedBy",
        select: "userId",
        populate: {
          path: "userId",
          model: "Users",
          select: "name email",
        },
      });
  } else {
    query = null;
  }
  return new ApiResponse(200, query, "Task List found");
});

// TESTED OK
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
  });
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
// TESTED OK
const UpdateTask = asyncHandler(async (req: RequestUser, res: Response) => {
  const { taskId } = req.params; // Task ID from the URL parameters
  const updates: Partial<ITasks> = req.body; // Fields to be updated

  if (!taskId) {
    return new ApiResponse(400, null, "Task ID is required");
  }

  delete updates._id;
  delete updates.assignedBy;
  // Find the task by ID and update it with the new fields
  const updatedTask = await Tasks.findByIdAndUpdate(taskId, updates, {
    new: true,
    runValidators: true,
  })
    .populate({
      path: "assignedTo",
      select: "userId",
      populate: {
        path: "userId",
        select: "name email",
        model: "Users",
      },
    })
    .populate({
      path: "assignedBy",
      select: "userId",
      populate: {
        path: "userId",
        select: "name email _id fcmTokens",
        model: "Users",
      },
    });
  switch (updates.status) {
    case "submitted":
      // here inform a task servicing manager
      // await projectNotification.add("task update", {
      //   action: "ASSIGN",
      //   data: {
      //     status: updatedTask?.status,
      //     // userId: staff?.userId?._id,
      //     emails: [(updatedTask?.assignedBy as any)?.userId?.email],
      //     // name: (staff.userId as any).name,
      //     deadline: updatedTask?.deadline,
      //     assignedBy: req?.user?.name,
      //   },
      //   notification: new Notification({
      //     title: updatedTask?.title!,
      //     description: updatedTask?.description!,
      //     type: "TASK",
      //     action: "task.open",
      //     actionText: "view task",
      //     symbol: "👷🏻",
      //   }),
      // });

      EmailQueue.add("task updation", {
        action: "TASK",
        data: "Task updation here " + updatedTask?.title + " " + updatedTask?.description,
        email: (updatedTask?.assignedBy as any)?.userId?.email!,
        userId: (updatedTask?.assignedBy as any)?.userId?._id.toString(),
        notification: new Notification({
          title: updatedTask?.title!,
          description: updatedTask?.description!,
          type: "TASK",
          action: "task.open",
          actionText: "view task",
          symbol: "👨🏽‍💻",
        }),
        subject: "New Task has been created",
      });
      // currently sending a notificaiton to only a owner
      await sendNotificationFCM({
        notification: new Notification({
          title: updatedTask?.title!,
          description: updatedTask?.description!,
          type: "TASK",
          action: "task.open",
          actionText: "view task",
          symbol: "🍾",
        }),
        user: (updatedTask?.assignedBy as any)?.userId as any,
      });


      break;
    case "feedback":
      EmailQueue.add("task updation", {
        action: "TASK",
        data: "Task feedback here " + updatedTask?.title + " " + updatedTask?.description,
        email: (updatedTask?.assignedTo as any)?.userId?.email!,
        userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
        notification: new Notification({
          title: updatedTask?.title!,
          description: updatedTask?.description!,
          type: "TASK",
          action: "task.open",
          actionText: "view task",
          symbol: "👨🏽‍💻",
        }),
        subject: "Task Feedback",
      });

      await sendNotificationFCM({
        notification: new Notification({
          title: updatedTask?.title!,
          description: updatedTask?.description!,
          type: "TASK",
          action: "task.open",
          actionText: "view task",
          symbol: "👷🏻",
        }),
        user: (updatedTask?.assignedTo as any)?.userId as any,
      });
      break;
    default:
  }

  if (!updatedTask) {
    return new ApiResponse(404, null, "Task not found");
  }

  return new ApiResponse(200, updatedTask, "Task updated successfully");
});

/*------- { api for resoruce kanbanboard } ---------*/
// TESTED OK
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
  monday.setDate(
    currentDate.getDate() - (currentDay === 0 ? 6 : currentDay - 1)
  ); // If Sunday, subtract 6, else subtract (currentDay - 1)

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
      path: "assignedTo",
      select: "userId",
      populate: {
        path: "userId",
        select: "name email",
        model: "Users",
      },
    })
    .populate({
      path: "assignedBy",
      select: "userId",
      populate: {
        path: "userId",
        select: "name email",
        model: "Users",
      },
    });

  return new ApiResponse(200, query, "Weekly Task List found");
});

export {
  CreateTask,
  TaskList,
  UpdateTask,
  TaskListByUserId,
  TaskListForResource,
};
