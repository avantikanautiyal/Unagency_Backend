import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { parseNotificationContent } from "../utils/notificationUtils";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Tasks, { ITasks } from "../models/tasks.model";
import Staff from "../models/staff.model";
import MediaFile from "../models/mediaFile.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import mongoose from "mongoose";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { Notification } from "../background/utils/notification";
import { EmailQueue } from "../background/queue/email.queue";

import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;

/** When a designer submits a draft, CS Inbox must see the linked requirement as pending review. */
async function syncRequirementPendingReview(projectId: unknown) {
  if (!projectId || !mongoose.Types.ObjectId.isValid(String(projectId))) return;
  const project = await Projects.findById(projectId)
    .select("userId brandId productPath title")
    .lean();
  if (!project?.userId) return;

  const filter: Record<string, unknown> = {
    userId: project.userId,
    status: { $nin: ["closed", "cancelled", "rejected", "approved", "delivered"] },
  };
  if (project.brandId) filter.brandId = project.brandId;
  if (project.productPath) filter.productPath = project.productPath;

  let updated = await Requirement.findOneAndUpdate(
    filter,
    { $set: { status: "pending_review" } },
    { sort: { updatedAt: -1 }, new: true }
  );

  // Fallback: match by title when brand/path weren't stored on the requirement
  if (!updated && project.title) {
    updated = await Requirement.findOneAndUpdate(
      {
        userId: project.userId,
        title: project.title,
        status: { $nin: ["closed", "cancelled", "rejected", "approved", "delivered"] },
      },
      { $set: { status: "pending_review" } },
      { sort: { updatedAt: -1 }, new: true }
    );
  }
}

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
  if (!mongoose.Types.ObjectId.isValid(project as any)) {
    return new ApiResponse(400, null, "Invalid Project ID");
  }

  const assignUserId: string = req.body?.assignedTo as string;

  if (!mongoose.Types.ObjectId.isValid(assignUserId)) {
    return new ApiResponse(400, null, "Invalid assignedTo ID");
  }

  const staff = await Staff.findOne({
    userId: assignUserId,
  }).populate("userId");
  if (!staff) return new ApiResponse(400, null, "Invalid resource Staff ID");

  const files = req.files as Express.Multer.File[];
  const fileIds: mongoose.Types.ObjectId[] = [];

  if (files && files.length > 0) {
    for (const file of files) {
      const newFile = await MediaFile.create({
        url: (file as any).location,
        fileName: file.originalname,
        uploadedAt: new Date(),
      });
      fileIds.push(newFile._id as mongoose.Types.ObjectId);
    }
  }

  const create = await Tasks.create({
    ...req.body,
    files: fileIds,
    assignedTo: staff._id,
    assignedBy: req.user?.staff?._id,
  });

  try {
    const { collaborationChannelService } = await import(
      "../services/collaboration/collaboration-channel-service"
    );
    const resourceUserId = String((staff.userId as { _id?: unknown })?._id ?? assignUserId);
    await collaborationChannelService.ensureForProject({
      actorUserId: String(req.user?.userId || resourceUserId),
      projectId: String(project),
      extraMemberUserIds: [resourceUserId],
    });
  } catch (err) {
    console.warn(
      "[CreateTask] project chat ensure failed (non-fatal):",
      err instanceof Error ? err.message : err
    );
  }

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

  const taskNotificationData = parseNotificationContent(NOTIFICATION_CONFIG.RESOURCE_TASK_ASSIGNED.email_body, { Name: (staff?.userId as any)?.name || "Member" });
  EmailQueue.add("task creation", {
    action: "TASK",
    data: commonTemplate({
      title: NOTIFICATION_CONFIG.RESOURCE_TASK_ASSIGNED.email_subject,
      content: taskNotificationData.text,
      name: (staff?.userId as any)?.name!,
      buttonText: taskNotificationData.cta || "View Task",
      buttonLink: `${FRONTEND_URL}/tasks/${create._id}`,
    }),
    email: (staff?.userId as any)?.email!,
    userId: staff?.userId?._id.toString(),
    notification: new Notification({
      title: NOTIFICATION_CONFIG.RESOURCE_TASK_ASSIGNED.in_app_title,
      description: NOTIFICATION_CONFIG.RESOURCE_TASK_ASSIGNED.in_app_body,
      type: "TASK",
      action: `${FRONTEND_URL}/tasks/${create._id}`,
      actionText: taskNotificationData.cta || "view task",
      symbol: "👨🏽‍💻",
    }),
    subject: NOTIFICATION_CONFIG.RESOURCE_TASK_ASSIGNED.email_subject,
  });

  // Notify CS about task creation (in-app only, no email)
  EmailQueue.add("CS task created", {
    action: "TASK",
    data: "",
    email: "",
    userId: req.user?.userId!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.CS_TASK_CREATED.in_app_title,
      description: NOTIFICATION_CONFIG.CS_TASK_CREATED.in_app_body,
      type: "TASK",
      action: `${FRONTEND_URL}/tasks/${create._id}`,
      actionText: "view task",
      symbol: "📝",
    }),
    subject: "",
  });



  return new ApiResponse(200, create, "Task assigned successfully");
});
// TESTED OK
const TaskList = asyncHandler(async (req: RequestUser, res: Response) => {
  const role = req.user?.role;
  const staffId =
    req.user?.staff &&
    typeof req.user.staff === "object" &&
    "_id" in req.user.staff
      ? req.user.staff._id
      : null;

  let filter: Record<string, unknown> | null = null;
  if (role === "admin" || role === "superadmin") {
    filter = {};
  } else if (!staffId) {
    return new ApiResponse(400, null, "Invalid Staff ID");
  } else if (role === "resource") {
    filter = { assignedTo: staffId };
  } else if (role === "servicing") {
    filter = { assignedBy: staffId };
  }

  if (!filter) {
    return new ApiResponse(200, [], "Task List found");
  }

  const query = await Tasks.find(filter)
    .sort({ createdAt: -1 })
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
    })
    .populate({
      path: "project",
      select:
        "_id title userId orgId executionId origin creationMode brandId productPath resource creativePrompt",
    })
    .populate("files");

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

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return new ApiResponse(400, null, "Invalid User ID");
  }

  const staff = await Staff.findOne({
    userId: userId,
  });
  if (!staff) return new ApiResponse(400, null, "user is not a staff");

  // Fetch tasks based on user role
  if (role === "resource") {
    query = await Tasks.find({ assignedBy: staff._id })
      .sort({ createdAt: -1 })
      .populate("files");
  } else if (role === "servicing") {
    query = await Tasks.find({ assignedTo: staff._id })
      .sort({ createdAt: -1 })
      .populate("files");
  } else {
    return new ApiResponse(403, null, "Access denied for this role");
  }
  // Return the results
  return new ApiResponse(200, query, "Task List found");
});
// TESTED OK
const UpdateTask = asyncHandler(async (req: RequestUser, res: Response) => {
  const { taskId } = req.params; // Task ID from the URL parameters
  const updates: Partial<ITasks> = { ...req.body }; // Fields to be updated

  if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
    return new ApiResponse(400, null, "Invalid Task ID");
  }

  delete updates._id;
  delete updates.assignedBy;

  // Admin UI historically sent "pending review" — map to schema enum.
  if (typeof updates.status === "string") {
    const normalized = updates.status.toLowerCase().trim();
    if (
      normalized === "pending review" ||
      normalized === "pending_review" ||
      normalized === "draft ready"
    ) {
      updates.status = "submitted";
    }
  }

  // Resolve assignedTo when a User id is provided (create-task style).
  if (updates.assignedTo && mongoose.Types.ObjectId.isValid(String(updates.assignedTo))) {
    const assignRaw = String(updates.assignedTo);
    const asStaff = await Staff.findById(assignRaw);
    if (!asStaff) {
      const byUser = await Staff.findOne({ userId: assignRaw });
      if (byUser) {
        updates.assignedTo = byUser._id as mongoose.Types.ObjectId;
      }
    }
  }

  // Append newly uploaded files (S3 via multer) onto the task.
  const uploaded = req.files as Express.Multer.File[] | undefined;
  const newFileIds: mongoose.Types.ObjectId[] = [];
  if (uploaded && uploaded.length > 0) {
    for (const file of uploaded) {
      const newFile = await MediaFile.create({
        url: (file as { location?: string }).location,
        fileName: file.originalname,
        uploadedAt: new Date(),
      });
      newFileIds.push(newFile._id as mongoose.Types.ObjectId);
    }
  }

  // Find the task by ID and update it with the new fields
  const role = req.user?.role;
  if (updates.status) {
    if (role === "servicing") {
      const allowedStatuses = ["feedback", "revision", "approved", "submitted"];
      if (!allowedStatuses.includes(updates.status)) {
        return new ApiResponse(
          403,
          null,
          `Servicing role can only update status to: ${allowedStatuses.join(", ")}`
        );
      }
    } else if (role === "resource") {
      const allowedStatuses = ["progress", "submitted"];
      if (!allowedStatuses.includes(updates.status)) {
        return new ApiResponse(
          403,
          null,
          `Resource role can only update status to: ${allowedStatuses.join(", ")}`
        );
      }
    }
  }

  const updateOps: Record<string, unknown> = { ...updates };
  if (newFileIds.length) {
    delete updateOps.files;
  }

  let updatedTask = await Tasks.findByIdAndUpdate(taskId, updateOps, {
    new: true,
    runValidators: true,
  });

  if (newFileIds.length && updatedTask) {
    updatedTask = await Tasks.findByIdAndUpdate(
      taskId,
      { $addToSet: { files: { $each: newFileIds } } },
      { new: true, runValidators: true }
    );
  }

  updatedTask = await Tasks.findById(taskId)
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
    })
    .populate("files");



  // Check for priority change
  if (updates.priority && updatedTask && updates.priority !== updatedTask.priority) {
    // Notify Resource about priority change (In-App Only)
    EmailQueue.add("task priority changed", {
      action: "TASK",
      data: "", // No email
      email: "", // No email
      userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
      notification: new Notification({
        title: NOTIFICATION_CONFIG.RESOURCE_PRIORITY_CHANGED.in_app_title,
        description: NOTIFICATION_CONFIG.RESOURCE_PRIORITY_CHANGED.in_app_body,
        type: "TASK",
        action: `${FRONTEND_URL}/tasks/${taskId}`,
        actionText: "view task",
        symbol: "⚠️",
      }),
      subject: "",
    });
  }

  // Check for status change notifications
  switch (updates.status) {
    case "submitted":
      // Surface on CS Inbox "Pending Review" (requirements drive that queue).
      try {
        await syncRequirementPendingReview(updatedTask?.project);
      } catch (err) {
        console.error("Failed to sync requirement pending_review after task submit", err);
      }

      EmailQueue.add("task updation", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.CS_TASK_SUBMITTED.email_subject,
          content: NOTIFICATION_CONFIG.CS_TASK_SUBMITTED.email_body,
          name: (updatedTask?.assignedBy as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedBy as any)?.userId?.email!,
        userId: (updatedTask?.assignedBy as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.CS_TASK_SUBMITTED.in_app_title,
          description: NOTIFICATION_CONFIG.CS_TASK_SUBMITTED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "✅",
        }),
        subject: NOTIFICATION_CONFIG.CS_TASK_SUBMITTED.email_subject,
      });

      // Notify Resource (In-App Only)
      EmailQueue.add("resource task submitted", {
        action: "TASK",
        data: "", // No email
        email: "", // No email
        userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.RESOURCE_TASK_SUBMITTED.in_app_title,
          description: NOTIFICATION_CONFIG.RESOURCE_TASK_SUBMITTED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "✅",
        }),
        subject: "",
      });



      break;
    case "feedback":
      EmailQueue.add("task updation", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.RESOURCE_FEEDBACK_ADDED.email_subject,
          content: NOTIFICATION_CONFIG.RESOURCE_FEEDBACK_ADDED.email_body,
          name: (updatedTask?.assignedTo as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedTo as any)?.userId?.email!,
        userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.RESOURCE_FEEDBACK_ADDED.in_app_title,
          description: NOTIFICATION_CONFIG.RESOURCE_FEEDBACK_ADDED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "💬",
        }),
        subject: NOTIFICATION_CONFIG.RESOURCE_FEEDBACK_ADDED.email_subject,
      });



      // Notify CS about feedback added
      EmailQueue.add("CS feedback added", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.CS_FEEDBACK_ADDED.email_subject,
          content: NOTIFICATION_CONFIG.CS_FEEDBACK_ADDED.email_body,
          name: (updatedTask?.assignedBy as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedBy as any)?.userId?.email!,
        userId: (updatedTask?.assignedBy as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.CS_FEEDBACK_ADDED.in_app_title,
          description: NOTIFICATION_CONFIG.CS_FEEDBACK_ADDED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "💬",
        }),
        subject: NOTIFICATION_CONFIG.CS_FEEDBACK_ADDED.email_subject,
      });
      break;
    case "revision":
      EmailQueue.add("task revision", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.RESOURCE_TASK_REVISION.email_subject,
          content: NOTIFICATION_CONFIG.RESOURCE_TASK_REVISION.email_body,
          name: (updatedTask?.assignedTo as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedTo as any)?.userId?.email!,
        userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.RESOURCE_TASK_REVISION.in_app_title,
          description: NOTIFICATION_CONFIG.RESOURCE_TASK_REVISION.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "🔄",
        }),
        subject: NOTIFICATION_CONFIG.RESOURCE_TASK_REVISION.email_subject,
      });
      break;
    case "approved":
      EmailQueue.add("task approved", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.RESOURCE_TASK_APPROVED.email_subject,
          content: NOTIFICATION_CONFIG.RESOURCE_TASK_APPROVED.email_body,
          name: (updatedTask?.assignedTo as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedTo as any)?.userId?.email!,
        userId: (updatedTask?.assignedTo as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.RESOURCE_TASK_APPROVED.in_app_title,
          description: NOTIFICATION_CONFIG.RESOURCE_TASK_APPROVED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "🎉",
        }),
        subject: NOTIFICATION_CONFIG.RESOURCE_TASK_APPROVED.email_subject,
      });

      // Notify CS about task approval
      EmailQueue.add("CS task approved", {
        action: "TASK",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.CS_TASK_APPROVED.in_app_title,
          content: NOTIFICATION_CONFIG.CS_TASK_APPROVED.in_app_body, // No email body defined in config, using in-app or custom? Using in_app_body which is "Task approved successfully."
          name: (updatedTask?.assignedBy as any)?.userId?.name!,
          buttonText: "View Task",
          buttonLink: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
        }),
        email: (updatedTask?.assignedBy as any)?.userId?.email!, // Config had email_body as "", but here we are sending email. Should I use default? 
        userId: (updatedTask?.assignedBy as any)?.userId?._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.CS_TASK_APPROVED.in_app_title,
          description: NOTIFICATION_CONFIG.CS_TASK_APPROVED.in_app_body,
          type: "TASK",
          action: `${FRONTEND_URL}/tasks/${updatedTask?._id}`,
          actionText: "view task",
          symbol: "🎉",
        }),
        subject: NOTIFICATION_CONFIG.CS_TASK_APPROVED.in_app_title, // Title as subject if subject is empty? user said email_subject for Task Approved is "Task approved successfully."
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
    .sort({ createdAt: -1 })
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
    })
    .populate("files");

  return new ApiResponse(200, query, "Weekly Task List found");
});

const getTaskById = asyncHandler(async (req: RequestUser) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return new ApiResponse(400, null, "Invalid Task ID");
  }

  const task = await Tasks.findById(id)
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
    })
    .populate({
      path: "project",
      select:
        "_id title userId orgId executionId origin creationMode brandId productPath resource creativePrompt",
    })
    .populate("files");

  if (!task) {
    return new ApiResponse(404, null, "Task not found");
  }

  return new ApiResponse(200, task, "Task found");
});

export {
  CreateTask,
  TaskList,
  UpdateTask,
  TaskListByUserId,
  TaskListForResource,
  getTaskById,
};
