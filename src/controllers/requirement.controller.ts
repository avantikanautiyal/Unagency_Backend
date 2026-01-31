import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import Requirement, { IRequirement } from "../models/requestProject.model";
import mongoose from "mongoose";
import { Notification } from "../background/utils/notification";
import Staff from "../models/staff.model";
import { EmailQueue } from "../background/queue/email.queue";

import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { parseNotificationContent } from "../utils/notificationUtils";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;

import { checkPlanLimit } from "../services/planLimit.service";

// TESTED OK
export const createRequirement = asyncHandler(async (req: RequestUser, res) => {
  // Check Plan Limit
  await checkPlanLimit(req.user?.userId!, undefined, "CREATE_BRIEF");

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

  // console.log(requirementBody) ;
  // return new ApiResponse(200,null,"");
  const newRequirement = await Requirement.create(requirementBody);
  const rm = await Staff.findOne({
    _id: new mongoose.Types.ObjectId(req.user?.relationship_manager + ""),
  }).populate("userId");


  const rmUser = await Users.findOne({
    _id: new mongoose.Types.ObjectId(rm?.userId?._id + ""),
  });
  // sending email to relationship manager
  // sending email to relationship manager
  EmailQueue.add(`NEW_RQUIREMENT_${rmUser?.email}`, {
    action: "REQUIRMENT",
    data: commonTemplate({
      title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
      content: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_body,
      name: rmUser?.name!,
      buttonText: "View Brief",
      buttonLink: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
    }),
    email: rmUser?.email!,
    userId: rm?.userId?._id.toString()!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_title,
      description: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_body,
      type: "REQUIRMENT",
      _id: newRequirement._id.toString(),
      symbol: "📋",
      action: `/requirement-logs/${newRequirement._id}`,
      actionText: "view brief",
    }),
    subject: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
  });

  // sending email to customer
  const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_body, { Name: req.user?.name || "User" });
  EmailQueue.add(`NEW_RQUIREMENT_${req.user?.email}`, {
    action: "REQUIRMENT",
    data: commonTemplate({
      title: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_subject,
      content: notificationData.text,
      name: req.user?.name!,
      buttonText: notificationData.cta,
      buttonLink: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
    }),
    email: req.user?.email!,
    userId: req.user?.userId.toString()!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.in_app_title,
      description: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.in_app_body,
      type: "REQUIRMENT",
      _id: newRequirement._id.toString(),
      symbol: "🫡",
      action: `/requirement-logs/${newRequirement._id}`,
      actionText: "view requirment",
    }),
    subject: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_subject,
  });

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
    const customer = await Users.findOne({ _id: userId });

    // Use dynamic logic here for approved/closed states if needed, but for now assuming this is general update or specific state
    // If status is specific, should use specific config. Assuming "REQUIRMENT_CLOSED" maps to BRIEF_APPROVED or similar if status is approved.

    EmailQueue.add(`REQUIRMENT_UPDATE_${customer?.email}`, {
      action: "REQUIRMENT",
      data: commonTemplate({
        title: NOTIFICATION_CONFIG.CS_BRIEF_APPROVED.email_subject, // Using CS_BRIEF_APPROVED as it implies approval/update
        content: NOTIFICATION_CONFIG.CS_BRIEF_APPROVED.email_body,
        // User asked to implement CS Notifications. This block is notifying CUSTOMER ("sending email to customer" - implied by EmailQueue.add(..., customer.email)).
        // However, we should check if we need to notify CS here too.
        name: req.user?.name!,
        buttonText: "View Requirement",
        buttonLink: `${FRONTEND_URL}/requirement-logs/${update?._id}`,
      }),
      email: customer?.email!,
      userId: customer?._id.toString()!,
      notification: new Notification({
        title: `Your brief just touched down at UNAGENCY`,
        description: IN_APP_NOTIFICATION_MESSAGES.REQUIRMENT_CLOSED,
        _id: update?._id.toString()!,
        type: "REQUIRMENT",
        symbol: "🫡",
        action: `/requirement-logs/${update?._id}`,
        actionText: "view requirment",
      }),
      subject: `Your brief just touched down at UNAGENCY | ${update?.title}`,
    });


    return new ApiResponse(200, update, "Requirement updated successfully");
  }
);

export const getRequirmentById = asyncHandler(async (req: RequestUser) => {
  const id: string = req.params.id;
  const requirment = await Requirement.findById(id)
    .populate("userId")
    .populate("category");
  return new ApiResponse(200, requirment, "Requirment fetch sucessfully");
})
