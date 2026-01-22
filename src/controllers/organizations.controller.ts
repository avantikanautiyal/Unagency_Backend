import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Organizations, { Organization } from "../models/organization.model";
import Teams from "../models/team.model";
import { RequestUser } from "../types/user";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";

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
    return new ApiResponse(200, updatedOrganization, "Organization Updated");
  }
);

export {
  createOrganization,
  UserOrganization,
  UpdateUserOrganization,
  OrganizationByUserId,
};
