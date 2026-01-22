import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Teams from "../models/team.model";
import { ApiError } from "../utils/apiError";
import Users from "../models/users.model";
import Organizations from "../models/organization.model";
import mongoose from "mongoose";
import { EmailQueue } from "../background/queue/email.queue";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES } from "../utils/constant/emailConstants";
import { Notification } from "../background/utils/notification";

const FRONTEND_URL: string = process.env.FRONTEND_URL!;

// TESTED OK
const RemoveMemberInOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { userId, organization } = req.body;
    if (!userId || !organization) {
      return new ApiResponse(400, null, "All Fields are required");
    }
    if (req.user?.userId.toString() === userId?.toString()) throw new ApiError("Can't remove itself", 400);
    const checkUser = await Teams.findOne({
      userId: new mongoose.Types.ObjectId(req.user?.userId),
      Organization: new mongoose.Types.ObjectId(organization as string),
    });
    if (!checkUser) throw new ApiError("Unauthorised Member Found", 401);
    if (checkUser.role == "owner") {

      const removeMember = await Teams.deleteOne({
        userId: new mongoose.Types.ObjectId(userId!),
        Organization: checkUser?.Organization,
      });
      if (removeMember.deletedCount === 0) {
        throw new ApiError("Member not found in the organization", 404);
      }
      if (removeMember) {
        // Send notification to Owner (confirmation)
        if (userId) {
          const removedUser = await Users.findById(userId);
          if (removedUser) {
            EmailQueue.add("MEMBER_REMOVED", {
              action: "COMMON",
              data: commonTemplate({
                name: req.user?.name!,
                content: IN_APP_NOTIFICATION_MESSAGES.MEMBER_REMOVED.replace("[Member Name]", removedUser.name),
                title: "Team update in your UNAGENCY workspace.",
                buttonText: "Manage Team",
                buttonLink: `${FRONTEND_URL}/settings/team`,
              }),
              email: req.user?.email!,
              userId: req.user?.userId.toString(),
              notification: new Notification({
                title: "Member Removed",
                description: `${removedUser.name} is no longer part of your workspace.`,
                type: "COMMON",
                action: "team.open",
                actionText: "manage team",
                symbol: "👋",
              }),
              subject: "Team update in your UNAGENCY workspace.",
            });
          }
        }

        return new ApiResponse(
          200,
          removeMember,
          "Member deleted successfully"
        );
      }
    } else {
      return new ApiResponse(
        401,
        null,
        "You are not allowed to delete member in an Organization"
      );
    }
  }
);

//TESTED OK
const fetchUserTeam = asyncHandler(async (req: RequestUser, res) => {
  const { organization, status } = req.query;
  if (!organization) throw new ApiError("organization not provied", 400);
  const checkUser = await Teams.findOne({
    Organization: new mongoose.Types.ObjectId(organization as string),
  });
  if (!checkUser) throw new ApiError("User not found", 401);
  const team = await Teams.find({
    Organization: checkUser?.Organization,
    invitationStatus: !!status ? "accepted" : { $exists: true },
    role: !!status ? "member" : { $exists: true },
  }).populate("userId", "name email");
  return new ApiResponse(200, team, "Team fetched successfully");
});

import { checkPlanLimit } from "../services/planLimit.service";

// TESTED OK - TODO
const InviteMemberInOrganization = asyncHandler(
  async (req: RequestUser, res) => {
    // Determine Org ID - logic exists inside function but we need it before invites
    // Actually the function fetches organization by owner: req.user.userId
    // So we can pass undefined or let the service fetch it, OR duplicate the fetch here.
    // Service has logic: "If no org defined provided, maybe fetch user's owned org"
    // So passing undefined should work if user is owner.

    // Check Plan Limit
    await checkPlanLimit(req.user?.userId!, undefined, "INVITE_MEMBER");

    const { email }: { email: string } = req.body;
    if (!email) throw new ApiError("Email not provided", 404);
    const invitedUser = await Users.findOne({
      email: email,
    });
    if (!invitedUser) throw new ApiError("User not found with this email", 404);
    const organization = await Organizations.findOne({
      owner: req.user?.userId!,
    });
    if (!organization) throw new ApiError("No Organization found", 404);

    const isExist = await Teams.exists({
      userId: invitedUser._id,
      Organization: organization._id,
    });
    if (isExist) return new ApiResponse(400, null, "Already invitation sent");

    const addMember = await Teams.create({
      userId: invitedUser?._id,
      role: "member",
      invitationStatus: "pending",
      Organization: organization,
    });

    EmailQueue.add("TEAM_INVITATION", {
      action: "COMMON",
      data: commonTemplate({
        name: invitedUser?.name!,
        content: IN_APP_NOTIFICATION_MESSAGES.MEMBER_INVITED.replace("[Name]", req?.user?.name!),
        title: "You’ve been invited to UNAGENCY.",
        buttonText: "Join Team",
        buttonLink: `${FRONTEND_URL}/invitation`,
      }),
      email: email,
      userId: invitedUser?._id.toString(),
      notification: new Notification({
        title: "Team Invitation",
        description: IN_APP_NOTIFICATION_MESSAGES.MEMBER_INVITED.replace("[Name]", req?.user?.name!),
        type: "COMMON",
        action: "invitation.open",
        actionText: "view invitation",
        _id: addMember._id.toString(),
        symbol: "🤝",
      }),
      subject: "You’ve been invited to UNAGENCY.",
    });

    return new ApiResponse(200, addMember, "Member invited successfully");
  }
);

// TESTED OK
export const getMyInvitations = asyncHandler(async (req: RequestUser, res) => {
  const invitation = await Teams.find({
    userId: new mongoose.Types.ObjectId(req.user?.userId),
    invitationStatus: "pending",
  }).populate("Organization", "owner companyName");
  return new ApiResponse(200, invitation, "Invitation list fetched");
});

// TESTED OK
export const inviteAction = asyncHandler(async (req: RequestUser, res) => {
  const {
    teamId,
    status,
  }: { teamId: string; status: "accepted" | "pending" | "rejected" } = req.body;
  if (!teamId && !status)
    throw new ApiError("Team ID or invitation status not provided", 400);

  const userCheck = await Teams.exists({
    userId: req.user?.userId,
    _id: teamId,
  });

  if (!userCheck) {
    throw new ApiError("You are not allowed to update invitation status", 400);
  }

  const updated = await Teams.findByIdAndUpdate(
    new mongoose.Types.ObjectId(teamId),
    { $set: { invitationStatus: status } } // Replace newStatus with the actual status value you want to set
  );
  if (status === "accepted") {
    const teamMember = await Teams.findById(teamId).populate("Organization");
    const organization: any = teamMember?.Organization;
    if (organization) {
      const owner = await Users.findById(organization.owner);
      const memberUser = await Users.findById(teamMember?.userId);

      // console.log(owner && memberUser, "owner", owner, "member teams", memberUser);
      if (owner && memberUser) {
        EmailQueue.add("MEMBER_JOINED", {
          action: "COMMON",
          data: commonTemplate({
            name: owner.name,
            content: IN_APP_NOTIFICATION_MESSAGES.MEMBER_JOINED.replace("[Member Name]", memberUser.name),
            title: "New member joined your UNAGENCY workspace.",
            buttonText: "View Team",
            buttonLink: `${FRONTEND_URL}/settings/team`,
          }),
          email: owner.email,
          userId: owner._id.toString(),
          notification: new Notification({
            title: "New Member Joined",
            description: `New member joined your workspace.`,
            type: "COMMON",
            action: "team.open",
            actionText: "view team",
            symbol: "👋",
          }),
          subject: "New member joined your UNAGENCY workspace.",
        });
      }
    }
  }

  return new ApiResponse(
    200,
    updated,
    "Invitation action perfomed successfully"
  );
});

const getCustomerTeamByOrganizationId = asyncHandler(async (req: RequestUser, res) => {
  const { organizationId } = req.params;
  if (!organizationId) throw new ApiError("organization not provied", 400);
  const clientTeam = await Teams.find({
    Organization: new mongoose.Types.ObjectId(organizationId as string),
  }).populate("userId", "_id name email");
  return new ApiResponse(200, clientTeam, "Team fetched successfully");
});

export {
  InviteMemberInOrganization,
  RemoveMemberInOrganization,
  fetchUserTeam,
  getCustomerTeamByOrganizationId
};
