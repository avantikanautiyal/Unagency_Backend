import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Teams from "../models/team.model";
import { ApiError } from "../utils/apiError";
import Users from "../models/users.model";
import { invitationTemplate } from "../utils/teamEmailInvitaiton/invitationEmailTemplate";
import { generateEmailOption, sentEmail } from "../utils/teamEmailInvitaiton";
import Organizations from "../models/organization.model";
import mongoose from "mongoose";

const AddMemberInOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { userId, role, organization } = req.body;
    if (!userId || !role || !organization) {
      return new ApiResponse(400, null, "All Fields are required");
    }
    //CHeck if User is the Owner or Admin of Organization to Add Member in an Organization;
    const checkUser = await Teams.findOne({
      userId: req.user?.userId,
      Organization: organization,
    });
    if (!checkUser) throw new ApiError("Unauthorised Member Found", 401);

    if (checkUser.role == "owner") {
      const isExist = await Teams.exists({
        userId: userId,
        Organization: organization,
      });
      if (isExist) {
        return new ApiResponse(400, null, "User is already in this team");
      }
      const addMember = await Teams.create({
        userId,
        role,
        Organization: checkUser?.Organization,
      });
      return new ApiResponse(200, addMember, "Member added successfully");
    } else {
      return new ApiResponse(
        401,
        null,
        "You are not allowed to add member in an Organization"
      );
    }
  }
);

const RemoveMemberInOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { userId, organization } = req.body;
    if (!userId || !organization) {
      return new ApiResponse(400, null, "All Fields are required");
    }
    //CHeck if User is the Owner or Admin of Organization to Add Member in an Organization;
    const checkUser = await Teams.findOne({
      userId: new mongoose.Types.ObjectId(req.user?.userId),
      Organization: new mongoose.Types.ObjectId(organization as string),
    });
    if (!checkUser) throw new ApiError("Unauthorised Member Found", 401);
    if (checkUser.role == "owner") {
      const removeMember = await Teams.deleteOne({
        userId: new mongoose.Types.ObjectId(userId),
        Organization: checkUser?.Organization,
      });

      if (removeMember.deletedCount === 0) {
        throw new ApiError("Member not found in the organization", 404);
      }
      if (removeMember) {
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

const fetchUserTeam = asyncHandler(async (req: RequestUser, res) => {
  const { organization, status } = req.query;
  // console.log("organization ", organization)
  if (!organization) throw new ApiError("organization not provied", 400);
  const checkUser = await Teams.findOne({
    Organization: new mongoose.Types.ObjectId(organization as string),
  });

  if (!checkUser) throw new ApiError("User not found", 401);
  console.log("invitation status ", !!status ? "accpted" : { $exists: true });
  const team = await Teams.find({
    Organization: checkUser?.Organization,
    // If `status` exists, filter by "accepted", otherwise fetch all.
    invitationStatus: !!status ? "accpted" : { $exists: true },
    // userId: { $ne: req.user?.userId }
    role: !!status ? "member" : { $exists: true }, // If `status` exists, filter by "member", otherwise fetch all.
  }).populate("userId", "name email");

  return new ApiResponse(200, team, "Team fetched successfully");
});

// POST
export const InviteMemberInOrgnization = asyncHandler(
  async (req: RequestUser, res) => {
    const { email }: { email: string } = req.body;
    if (!email) throw new ApiError("email not provided", 401);
    const invitedUser = await Users.findOne({
      email: email,
    });
    if (!invitedUser) throw new ApiError("User not found with this email", 404);
    const organization = await Organizations.findOne({
      owner: req.user?.userId!,
    });
    if (!organization) throw new ApiError("no orgnization found", 404);

    const isExist = await Teams.exists({
      userId: invitedUser._id,
      Organization: organization._id,
    });
    if (isExist)
      return new ApiResponse(400, null, "User is already in the team");

    const mail = generateEmailOption({
      email: email,
      subject: "Team invitation",
      html: invitationTemplate({
        orgnizationName: organization.companyName,
        name: invitedUser?.name,
        link: `http://localhost:5173/invites?token=${organization._id}`,
      }),
    });
    const emailSend = await sentEmail(mail);
    const addMember = await Teams.create({
      userId: invitedUser._id,
      role: "member",
      invitationStatus: "pending",
      Organization: organization,
    });
    return new ApiResponse(200, addMember, "Member added successfully");
  }
);

export const getMembersInvitations = asyncHandler(
  async (req: RequestUser, res) => {
    const invitations = await Teams.find({
      userId: req.user?.userId,
      invitationStatus: { $ne: "accpted" },
    }).populate("Organization");
    return new ApiResponse(200, invitations, "invitation fetch successfully");
  }
);

export const getMyInvitations = asyncHandler(async (req: RequestUser, res) => {
  const invitation = await Teams.find({
    userId: new mongoose.Types.ObjectId(req.user?.userId),
    invitationStatus: "pending",
    role: { $ne: "owner" },
  }).populate("Organization");

  return new ApiResponse(200, invitation);
});

// PATCH
export const invitationInvitation = asyncHandler(
  async (req: RequestUser, res) => {
    const {
      teamId,
      status,
    }: { teamId: string; status: "accpted" | "pending" | "rejected" } =
      req.body;
    if (!teamId && !status)
      throw new ApiError("teamId | invitation status not provided", 400);

    const updated = await Teams.updateOne(
      {
        _id: new mongoose.Types.ObjectId(teamId),
      },
      { $set: { invitationStatus: status } } // Replace newStatus with the actual status value you want to set
    );
    return new ApiResponse(
      200,
      updated,
      "invitation action perfomed successfully"
    );
  }
);

export { AddMemberInOrganization, RemoveMemberInOrganization, fetchUserTeam };
