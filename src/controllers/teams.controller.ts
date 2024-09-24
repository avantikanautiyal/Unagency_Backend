import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import Teams from "../models/team.model";
import { ApiError } from "../utils/apiError";

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
      user: req.user?.userId,
      Organization: organization,
    });
    if (!checkUser) throw new ApiError("Unauthorised Member Found", 401);
    if (checkUser.role == "owner") {
      const removeMember = await Teams.deleteOne({
        userId,
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
  const { organization } = req.body;
  const checkUser = await Teams.findOne({
    Organization: organization,
    userId: req?.user?.userId,
  });

  if (!checkUser) throw new ApiError("User not found", 401);
  const team = await Teams.find({
    Organization: checkUser?.Organization,
  }).populate("userId", "name email").populate("Organization");

  return new ApiResponse(200, team, "Team fetched successfully");
});

export { AddMemberInOrganization, RemoveMemberInOrganization, fetchUserTeam };
