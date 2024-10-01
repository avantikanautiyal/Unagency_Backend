import Projects, { IProject } from "../models/projects.model";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import Teams from "../models/team.model";
import {
  // assignChatRoomToResourse,
  // createChatRoom,
  createRoomForProject
} from "../services/Chatstream";
import Organizations, { Organization } from "../models/organization.model";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";
import Staff from "../models/staff.model";
import ChatRoom from "../models/chatRoom.model";

const createProject = asyncHandler(async (req: RequestUser, res) => {
  const body: IProject = req.body;

  // return new ApiResponse(200, body, "Project body");

  const isExist = await Projects.exists({
    userId: body.userId,
    title: body.title,
  });
  if (body.orgId) {
    const isExistOrgnization = await Organizations.exists({
      _id: new mongoose.Types.ObjectId(body.orgId)
    });
    if (!isExistOrgnization) throw new ApiError("invalid Orgnization Id", 400)
  }
  if (isExist) {
    return new ApiResponse(409, null, "Project already exists");
  }


  const teamMemberIds = body.clientTeam as string[]; // fetch users
  const teams = await Teams.find({ _id: { $in: teamMemberIds } })
  const create = await Projects.create(body);
  if (create) {

    const membersList: string[] = teams.map((member: any) => member.userId + "")
    if (!body.orgId) return new ApiResponse(200, { project: create }, "Project created successfully");
    const roomInfo = await createRoomForProject({
      roomName: create.title,
      roomId: create._id + "",
      membersId: [...membersList, req?.user?.userId!, body.userId + ""],
      relationShipManagerId: req?.user?.userId!
    })
    // ChatRoom.create({
    //   roomName: create.title,
    //   roomId: create._id + "",
    //   userId: new mongoose.Types.ObjectId(body.userId + ""),
    //   // membersId: [...membersList, req?.user?.userId!, body.userId + ""],
    //   relationShipManagerId: req?.user?.userId!
    // })
    return new ApiResponse(200, { chatRoom: roomInfo, project: create }, "Project created successfully");
  }
});

//For Customer to see their Projects
const fetchProject = asyncHandler(async (req: RequestUser, res) => {
  const projects = await Projects.find({ userId: req?.user?.userId })
    .populate({
      path: "userId",
      select: "firebaseId role name email ",
    })
    .populate({
      path: "orgId",
      select: "companyName contactPerson contactEmail contactMobile industry",
    });
  return new ApiResponse(200, projects, "Projects fetched successfully");
});


// it's for both Relationship manager and normal client to fetch 
//For Relationship Manager to see client's Projects
const fetchClientProject = asyncHandler(async (req: RequestUser, res) => {
  const { userId } = req.query;
  if (!userId) throw new ApiError("userId not provided", 400);

  const isManger = await isServecingManager(req.user?.userId!, userId as string)
  if (!isManger.value) return new ApiResponse(200, null, isManger.message);
  const projects = await Projects.find({ userId: new mongoose.Types.ObjectId(userId as string) })
    .populate({
      path: "userId",
      select: "firebaseId role name email",
    });
  return new ApiResponse(200, projects, "Projects fetched successfully");

});





const updateProject = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const body: IProject = req.body;

  const checkRelationShipManager = await Users.findOne({
    userId: body.userId,
    relationship_manager: req?.user?.userId,
  });

  if (checkRelationShipManager) {
    const update = await Projects.findOneAndUpdate(
      {
        userId: body.userId,
        _id: projectId,
      },
      {
        $set: body,
      }
    );

    return new ApiResponse(200, update, "Project updated successfully");
  } else {
    return new ApiResponse(401, null, "You are not assigned for this Customer");
  }
});


const fetchClientProjectById = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const body: IProject = req.body;

  const checkRelationShipManager = await Users.exists({
    userId: body.userId,
    relationship_manager: req?.user?.userId,
  });

  if (checkRelationShipManager) {
    const project = await Projects.findOne({
      userId: body.userId,
      _id: projectId,
    });

    return new ApiResponse(200, project, "Project fetched successfully");
  } else {
    return new ApiResponse(401, null, "You are not assigned for this Customer");
  }
});

const fetchProjectById = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const project = await Projects.findOne({
    // userId: req.user?.userId,
    _id: new mongoose.Types.ObjectId(projectId),
  });
  if (!project) return new ApiResponse(200, project, "Project Fetched successfully");
  return new ApiResponse(200, project, "Project Fetched successfully");
});

const isServecingManager = async (RMID: string, customerId: string) => {
  const Rmanager = await Staff.findOne({
    userId: new mongoose.Types.ObjectId(RMID)
  })
  if (!Rmanager) return { value: true, message: "not a staff" };

  const checkRelationShipManager = await Users.exists({
    _id: new mongoose.Types.ObjectId(customerId),
    relationship_manager: Rmanager._id,
  });

  if (!checkRelationShipManager) return { value: false, message: "You are not assigned for this Customer" };

  return { value: true };


}
export {
  createProject,
  fetchClientProject,
  fetchProject,
  updateProject,
  fetchProjectById,
  fetchClientProjectById,
};
