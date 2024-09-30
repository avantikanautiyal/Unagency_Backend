import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Organizations, { Organization } from "../models/organization.model";
import Teams from "../models/team.model";
import { RequestUser } from "../types/user";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";
import Users from "../models/users.model";
// import {
//   assignChatRoomToResourse,
//   createChatRoom,
// } from "../services/Chatstream";

// interface UserType {
//   userId: mongoose.Types.ObjectId;
//   firebaseId: string;
//   role: string;
//   contact: number;
//   name: string;
//   state: string;
//   country: string;
//   isVerified: boolean;
//   email: string;
// }
// type RequestUser = Request & {
//   user?: UserType;
// };
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

    const organization = await Organizations.create(new Organization({
      ...req.body,
      owner: req?.user?.userId,
    }));

    if (organization) {
      await Teams.create({
        Organization: organization._id,
        role: "owner",
        invitationStatus: "accpted",
        userId: req?.user?.userId,
      });
      // const room = await assignChatRoomToResourse({
      //   id: organization._id + "",
      //   roomName: companyName,
      // });
      return new ApiResponse(
        200,
        organization,
        "Organization created successfully"
      );
    }
  }
);
const fetchOrganizations = asyncHandler(async (req: Request, res: Response) => {
  const organizations = await Organizations.find({});
  if (organizations) {
    return new ApiResponse(200, organizations, "Organizations fetched");
  }
});
const UserOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const userOrganization = await Organizations.findOne({
      owner: new mongoose.Types.ObjectId(req?.user?.userId),
    });
    return new ApiResponse(
      200,
      userOrganization,
      "User Organization fetched"
    );
  }
);

const UpdateUserOrganization = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId = req.params.organizationId;
    const existingOrganization = await Organizations.findById(organizationId);
    if (!existingOrganization) {
      return new ApiResponse(404, null, "Organization not found");
    }

    if (req.body.companyName || req.body.owner) {
      return new ApiResponse(
        400,
        null,
        "company Name cannot be updated once created"
      );
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

//
const getOrginiztionMyUserId = asyncHandler(async (req: RequestUser, res) => {
  const { userId } = req.params;

  if (!userId) throw new ApiError("userId not provided", 400);

  const org = await Organizations.findOne({
    owner: new mongoose.Types.ObjectId(userId),
  });
  return new ApiResponse(200, org, "");
});

export {
  createOrganization,
  fetchOrganizations,
  UserOrganization,
  UpdateUserOrganization,
  getOrginiztionMyUserId
};
