import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Organizations, { Organization } from "../models/organization.model";
import Teams from "../models/team.model";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";

import { EmailQueue } from "../background/queue/email.queue";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { Notification } from "../background/utils/notification";
import { parseNotificationContent } from "../utils/notificationUtils";
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
      // Send Organization Created Email
      const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.ORGANIZATION_CREATED.email_body, { Name: req.user?.name || "User" });
      EmailQueue.add("ORG_CREATED", {
        action: "COMMON",
        data: commonTemplate({
          name: req.user?.name!,
          content: notificationData.text,
          title: NOTIFICATION_CONFIG.ORGANIZATION_CREATED.email_subject,
          buttonText: notificationData.cta,
          buttonLink: `${FRONTEND_URL}`,
        }),
        email: req.user?.email!,
        userId: req.user?.userId.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.ORGANIZATION_CREATED.in_app_title,
          description: NOTIFICATION_CONFIG.ORGANIZATION_CREATED.in_app_body,
          type: "COMMON",
          action: `${FRONTEND_URL}/organization`,
          actionText: "view dashboard",
          symbol: "🚀",
        }),
        subject: NOTIFICATION_CONFIG.ORGANIZATION_CREATED.email_subject,
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
            title: NOTIFICATION_CONFIG.CS_ORG_CREATED.email_subject,
            content: NOTIFICATION_CONFIG.CS_ORG_CREATED.email_body,
            name: relationship_manager?.name!,
            buttonText: "View Client",
            buttonLink: `${FRONTEND_URL}/customers/${req.user?.userId}`,
          }),
          email: relationship_manager?.email!,
          userId: relationship_manager?._id.toString(),
          notification: new Notification({
            title: NOTIFICATION_CONFIG.CS_ORG_CREATED.in_app_title,
            description: NOTIFICATION_CONFIG.CS_ORG_CREATED.in_app_body,
            type: "COMMON",
            action: `${FRONTEND_URL}/customers/${req.user?.userId}`,
            actionText: "view client",
            symbol: "🏢",
          }),
          subject: NOTIFICATION_CONFIG.CS_ORG_CREATED.email_subject,
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

  const ownerOrg = await Organizations.findOne({
    owner: new mongoose.Types.ObjectId(userId),
  });

  if (ownerOrg) {
    return new ApiResponse(200, ownerOrg, "");
  }

  const membership = await Teams.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    invitationStatus: "accepted",
  });

  if (membership?.Organization) {
    const org = await Organizations.findById(membership.Organization);
    return new ApiResponse(200, org, "");
  }

  return new ApiResponse(200, null, "");
});

/**
 * Batch org lookup by owner user ids — one query for CS/admin dashboards.
 * Body: { userIds: string[] }
 */
const OrganizationsByOwners = asyncHandler(async (req: RequestUser) => {
  const raw = (req.body as { userIds?: unknown })?.userIds;
  const userIds = Array.isArray(raw)
    ? [...new Set(raw.map((id) => String(id ?? "").trim()).filter(Boolean))]
    : [];

  if (!userIds.length) {
    return new ApiResponse(200, {}, "Organizations fetched");
  }

  const objectIds = userIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const ownerOrgs = objectIds.length
    ? await Organizations.find({ owner: { $in: objectIds } })
        .select("_id owner companyName industry contactPerson contactEmail")
        .lean()
    : [];

  const byOwner = new Map(
    ownerOrgs.map((org) => [String(org.owner), org])
  );

  const missing = userIds.filter((id) => !byOwner.has(id));
  if (missing.length) {
    const memberObjectIds = missing
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (memberObjectIds.length) {
      const memberships = await Teams.find({
        userId: { $in: memberObjectIds },
        invitationStatus: "accepted",
      })
        .select("userId Organization")
        .lean();
      const orgIds = memberships
        .map((m) => m.Organization)
        .filter(Boolean);
      const memberOrgs = orgIds.length
        ? await Organizations.find({ _id: { $in: orgIds } })
            .select("_id owner companyName industry contactPerson contactEmail")
            .lean()
        : [];
      const orgById = new Map(memberOrgs.map((org) => [String(org._id), org]));
      for (const membership of memberships) {
        const userId = String(membership.userId);
        if (byOwner.has(userId)) continue;
        const org = orgById.get(String(membership.Organization));
        if (org) byOwner.set(userId, org);
      }
    }
  }

  const result: Record<string, unknown> = {};
  for (const userId of userIds) {
    result[userId] = byOwner.get(userId) ?? null;
  }

  return new ApiResponse(200, result, "Organizations fetched");
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
          title: NOTIFICATION_CONFIG.CS_ORG_UPDATED.in_app_title,
          description: NOTIFICATION_CONFIG.CS_ORG_UPDATED.in_app_body,
          type: "COMMON",
          action: `${FRONTEND_URL}/customers/${req.user?.userId}`,
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
  OrganizationsByOwners,
};
