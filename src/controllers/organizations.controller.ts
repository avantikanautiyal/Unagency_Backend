import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Organizations, { Organization } from "../models/organization.model";
import Teams from "../models/team.model";
import { RequestUser } from "../types/user";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";
import Users from "../models/users.model";

import { EmailQueue } from "../background/queue/email.queue";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES } from "../utils/constant/emailConstants";
import { Notification } from "../background/utils/notification";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;

//TESTED OK
const createOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const {
      companyName,
      companyType,
      industry,
      contactPerson,
      contactMobile,
      contactEmail,
    } = req.body;

    if (
      !companyName ||
      !companyType ||
      !industry ||
      !contactPerson ||
      !contactMobile ||
      !contactEmail
    ) {
      return new ApiResponse(400, null, "All required fields must be provided");
    }

    const isExist = await Organizations.exists({ owner: req.user?.userId });
    if (isExist) {
      return new ApiResponse(409, null, "Organization already exists");
    }

    const organization = await Organizations.create(
      new Organization({
        ...req.body,
        owner: req?.user?.userId,
      })
    );

    if (organization) {
      await Teams.create({
        Organization: organization._id,
        role: "owner",
        invitationStatus: "accepted",
        userId: req?.user?.userId,
      });

      // Send Organization Created Email
      EmailQueue.add("ORG_CREATED", {
        action: "COMMON",
        data: commonTemplate({
          name: req.user?.name!,
          content: IN_APP_NOTIFICATION_MESSAGES.ORG_CREATED,
          title: "Your UNAGENCY workspace is ready.",
          buttonText: "Go to Workspace",
          buttonLink: `${FRONTEND_URL}/dashboard`,
        }),
        email: req.user?.email!,
        userId: req.user?.userId.toString(),
        notification: new Notification({
          title: "Workspace Created",
          description: "Your UNAGENCY workspace is ready.",
          type: "COMMON",
          action: "dashboard.open",
          actionText: "open dashboard",
          symbol: "🏢",
        }),
        subject: "Your UNAGENCY workspace is ready.",
      });

      // Notify CS about organization creation
      const customer = await Users.findById(req.user?.userId).populate("relationship_manager");
      const relationship_manager = await Users.findOne({
        _id: (customer?.relationship_manager as any),
      });

      if (relationship_manager) {
        EmailQueue.add("CS ORG_CREATED", {
          action: "COMMON",
          data: commonTemplate({
            title: "Organisation created",
            content: IN_APP_NOTIFICATION_MESSAGES.CS_ORG_CREATED,
            name: relationship_manager?.name!,
            buttonText: "View Client",
            buttonLink: `${FRONTEND_URL}/customers/${req.user?.userId}`,
          }),
          email: relationship_manager?.email!,
          userId: relationship_manager?._id.toString(),
          notification: new Notification({
            title: "Client organisation created",
            description: IN_APP_NOTIFICATION_MESSAGES.CS_ORG_CREATED,
            type: "COMMON",
            action: "customer.view",
            actionText: "view client",
            symbol: "🏢",
          }),
          subject: "Organisation created",
        });
      }

      return new ApiResponse(
        200,
        organization,
        "Organization created successfully"
      );
    }
  }
);
//TESTED OK
const UserOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const userOrganization = await Organizations.findOne({
      owner: new mongoose.Types.ObjectId(req?.user?.userId),
    });
    return new ApiResponse(200, userOrganization, "User Organization fetched");
  }
);
//TESTED OK
const OrganizationByUserId = asyncHandler(async (req: RequestUser, res) => {
  const { userId } = req.params;

  if (!userId) throw new ApiError("userId not provided", 400);

  const org = await Organizations.findOne({
    owner: new mongoose.Types.ObjectId(userId),
  });
  return new ApiResponse(200, org, "");
});

//TESTED OK = TODO - Remove params
const UpdateUserOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId = req.params.organizationId;
    const existingOrganization = await Organizations.findById(organizationId);
    if (!existingOrganization) {
      return new ApiResponse(404, null, "Organization not found");
    }

    if (req.body.owner) {
      return new ApiResponse(400, null, "Something went wrong");
    }

    const updatedOrganization = await Organizations.findOneAndUpdate(
      { _id: organizationId, owner: req?.user?.userId },
      {
        $set: req.body,
      },
      { new: true, runValidators: true } // Ensure that validators run during update
    );

    // Notify CS about organization update (in-app only, no email)
    const customer = await Users.findById(req.user?.userId);
    const relationship_manager = await Users.findOne({
      _id: (customer?.relationship_manager as any),
    });

    if (relationship_manager) {
      EmailQueue.add("CS ORG_UPDATED", {
        action: "COMMON",
        data: "",
        email: "",
        userId: relationship_manager?._id.toString(),
        notification: new Notification({
          title: "Client organisation details updated",
          description: IN_APP_NOTIFICATION_MESSAGES.CS_ORG_UPDATED,
          type: "COMMON",
          action: "customer.view",
          actionText: "view client",
          symbol: "📝",
        }),
        subject: "",
      });
    }

    return new ApiResponse(200, updatedOrganization, "Organization Updated");
  }
);

export {
  createOrganization,
  UserOrganization,
  UpdateUserOrganization,
  OrganizationByUserId,
};
