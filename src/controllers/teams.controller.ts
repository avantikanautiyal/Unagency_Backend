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
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { Notification } from "../background/utils/notification";
import { parseNotificationContent } from "../utils/notificationUtils";
import { dispatchClientNotification } from "../notifications/client-notification-service";
import {
  countUsedMemberSeats,
  findUserByEmailInsensitive,
  normalizeInviteEmail,
  resolveAdditionalMemberSeats,
} from "../services/team-invitation-service";

const FRONTEND_URL: string = process.env.FRONTEND_URL!;

// TESTED OK
const RemoveMemberInOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { organization, teamId } = req.body;
    let { userId } = req.body;
    if ((!userId && !teamId) || !organization) {
      return new ApiResponse(400, null, "All Fields are required");
    }
    if (userId && req.user?.userId.toString() === userId?.toString()) throw new ApiError("Can't remove itself", 400);
    const checkUser = await Teams.findOne({
      userId: new mongoose.Types.ObjectId(req.user?.userId),
      Organization: new mongoose.Types.ObjectId(organization as string),
    });
    if (!checkUser) throw new ApiError("Unauthorised Member Found", 401);
    if (checkUser.role == "owner") {
      // teamId covers invites sent to an email that has no account yet.
      const target = await Teams.findOne({
        Organization: checkUser.Organization,
        role: "member",
        ...(teamId
          ? { _id: new mongoose.Types.ObjectId(String(teamId)) }
          : { userId: new mongoose.Types.ObjectId(String(userId)) }),
      });
      if (!target) {
        throw new ApiError("Member not found in the organization", 404);
      }
      userId = target.userId ? target.userId.toString() : undefined;
      const removeMember = await Teams.deleteOne({ _id: target._id });
      if (removeMember.deletedCount === 0) {
        throw new ApiError("Member not found in the organization", 404);
      }
      if (removeMember && !userId) {
        // Pending invite to an email with no account yet.
        const organisation = await Organizations.findById(organization);
        await dispatchClientNotification({
          eventKey: "TEAM_MEMBER_REMOVED",
          userId: req.user!.userId,
          variables: {
            Name: target.invitedEmail || "Team member",
            Organisation: organisation?.companyName || "your workspace",
          },
          primaryAction: { action: "/manage-team", text: "View Team" },
          entityType: "organisation",
          entityId: organization,
          dedupeKey: `${String(target._id)}:removed:${Date.now()}`,
          channels: ["in_app"],
          symbol: "👋",
        });
      }
      if (removeMember) {
        // Send notification to Owner (confirmation)
        if (userId) {
          const removedUser = await Users.findById(userId);
          if (removedUser) {
            // Notify removed member
            // Notify removed member
            const notificationDataSelf = parseNotificationContent(NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.email_body, { Name: removedUser.name || "User" });
            EmailQueue.add("YOU_ARE_REMOVED_FROM_WORKSPACE", {
              action: "COMMON",
              data: commonTemplate({
                name: removedUser.name,
                content: notificationDataSelf.text,
                title: NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.email_subject,
                buttonText: notificationDataSelf.cta,
                buttonLink: `${FRONTEND_URL}`,
              }),
              email: removedUser.email,
              userId: removedUser._id.toString(),
              notification: new Notification({
                title: NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.in_app_title,
                description: NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.in_app_body,
                type: "COMMON",
                action: "/organization",
                actionText: "view details",
                symbol: "👋",
              }),
              subject: NOTIFICATION_CONFIG.REMOVED_FROM_WORKSPACE.email_subject,
            });

            const organisation = await Organizations.findById(organization);
            await dispatchClientNotification({
              eventKey: "TEAM_MEMBER_REMOVED",
              userId: req.user!.userId,
              variables: {
                Name: removedUser.name || "Team member",
                Organisation: organisation?.companyName || "your workspace",
              },
              primaryAction: {
                action: "/manage-team",
                text: "View Team",
              },
              entityType: "organisation",
              entityId: organization,
              dedupeKey: `${organization}:${removedUser._id}:removed:${Date.now()}`,
              channels: ["in_app", "email"],
              symbol: "👋",
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
  }).populate("userId", "name email image");
  return new ApiResponse(200, team, "Team fetched successfully");
});


const InviteMemberInOrganization = asyncHandler(
  async (req: RequestUser, res) => {
    // Only the organisation owner manages the team.
    const organization = await Organizations.findOne({
      owner: req.user?.userId!,
    });
    if (!organization) {
      throw new ApiError("Only the organisation owner can invite members", 403);
    }

    const email = normalizeInviteEmail(req.body?.email);
    if (!email) throw new ApiError("Enter a valid email address", 400);

    const inviter = await Users.findById(req.user?.userId).select("name email");
    if (normalizeInviteEmail(inviter?.email) === email) {
      throw new ApiError("You are already the owner of this organisation", 400);
    }

    const invitedUser = await findUserByEmailInsensitive(email);

    const existing = await Teams.findOne({
      Organization: organization._id,
      $or: [
        { invitedEmail: email },
        ...(invitedUser ? [{ userId: invitedUser._id }] : []),
      ],
    });
    if (existing?.invitationStatus === "accepted") {
      throw new ApiError("This person is already a member of your team", 409);
    }

    // A pending invite already holds its seat; re-sending must not count twice.
    if (!existing || existing.invitationStatus !== "pending") {
      const seats = await resolveAdditionalMemberSeats(req.user!.userId);
      if (seats !== null) {
        const used = await countUsedMemberSeats(organization._id);
        if (used >= seats) {
          await dispatchClientNotification({
            eventKey: "TEAM_LIMIT_REACHED",
            userId: req.user!.userId,
            primaryAction: { action: "/subscription-billing", text: "View Plans" },
            secondaryAction: { action: "/manage-team", text: "Manage Team" },
            entityType: "organisation",
            entityId: organization._id,
            dedupeKey: `team-limit:${Math.floor(Date.now() / 60_000)}`,
            channels: ["in_app"],
          });
          throw new ApiError(
            seats === 0
              ? "Your plan doesn't include team seats. Upgrade your plan to invite members."
              : `All ${seats} team seat${seats === 1 ? "" : "s"} on your plan are in use. Upgrade your plan or remove a member to invite someone new.`,
            403
          );
        }
      }
    }

    const teamRow = existing
      ? await Teams.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              invitationStatus: "pending",
              invitedEmail: email,
              invitedBy: req.user?.userId,
              ...(invitedUser ? { userId: invitedUser._id } : {}),
            },
          },
          { new: true }
        )
      : await Teams.create({
          Organization: organization._id,
          role: "member",
          invitationStatus: "pending",
          invitedEmail: email,
          invitedBy: req.user?.userId,
          ...(invitedUser ? { userId: invitedUser._id } : {}),
        });

    if (invitedUser) {
      await dispatchClientNotification({
        eventKey: "TEAM_MEMBER_ADDED",
        userId: req.user!.userId,
        variables: { Name: invitedUser.name || email },
        primaryAction: { action: "/manage-team", text: "View Team" },
        entityType: "organisation",
        entityId: organization._id,
        dedupeKey: `${String(teamRow!._id)}:added:${Date.now()}`,
        channels: ["in_app"],
        symbol: "🤝",
      });
    }

    const inviterName = req?.user?.name || inviter?.name || "Someone";
    const companyName = (organization as any).companyName || "their";
    const inviteeName = invitedUser?.name || email.split("@")[0];
    const content =
      `Hey ${inviteeName}, ${inviterName} just invited you to join ${companyName} on UNAGENCY. ` +
      `Sign in with Google using ${email} and you'll land straight in the team's workspace — ` +
      `same brands, vault and dashboard. No extra setup needed.`;

    EmailQueue.add("TEAM_INVITATION", {
      action: "COMMON",
      data: commonTemplate({
        name: inviteeName,
        content,
        title: NOTIFICATION_CONFIG.MEMBER_INVITED.email_subject,
        buttonText: "Join with Google",
        buttonLink: `${FRONTEND_URL}/login`,
      }),
      email,
      // In-app notification only when the invitee already has an account.
      ...(invitedUser
        ? {
            userId: invitedUser._id.toString(),
            notification: new Notification({
              title: `You've been added to ${companyName}`,
              description: `${inviterName} invited you to their UNAGENCY workspace. You'll have access the next time you open the app.`,
              type: "COMMON",
              action: "/home",
              actionText: "Open workspace",
              _id: teamRow!._id.toString(),
              symbol: "🤝",
            }),
          }
        : {}),
      subject: NOTIFICATION_CONFIG.MEMBER_INVITED.email_subject,
    });

    return new ApiResponse(
      200,
      teamRow,
      existing ? `Invitation re-sent to ${email}` : `Invitation sent to ${email}`
    );
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
        await dispatchClientNotification({
          eventKey: "INVITE_ACCEPTED",
          userId: owner._id,
          variables: {
            Name: memberUser.name || "Team member",
            Organisation: organization.companyName || "your workspace",
          },
          primaryAction: {
            action: "/manage-team",
            text: "View Team",
          },
          entityType: "organisation",
          entityId: organization._id,
          dedupeKey: `${teamId}:accepted`,
          channels: ["in_app", "email"],
          symbol: "👋",
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
