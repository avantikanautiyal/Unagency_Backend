import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import Organizations from "../models/organization.model";
import Teams from "../models/team.model";
import { RequestUser } from "../types/user";
import {
  assignChatRoomToResourse,
  createChatRoom,
} from "../services/Chatstream";

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
    const organization = await Organizations.create({
      owner: req?.user?.userId,
      companyName,
      companyType,
      industry,
      contactPerson,
      contactMobile,
      contactEmail,
    });

    if (organization) {
      await Teams.create({
        Organization: organization._id,
        role: "owner",
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
    const userOrganization = await Organizations.find({
      owner: req?.user?.userId,
    });
    if (userOrganization) {
      return new ApiResponse(
        200,
        userOrganization,
        "User Organization fetched"
      );
    }
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

export {
  createOrganization,
  fetchOrganizations,
  UserOrganization,
  UpdateUserOrganization,
};
