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

const createProject = asyncHandler(async (req: RequestUser, res) => {
  const body: IProject = req.body;
  const isExist = await Projects.exists({
    userId: body.userId,
    title: body.title,
  });
  if (isExist) {
    return new ApiResponse(409, null, "Project already exists");
  }


  const teamMemberIds = body.clientTeam as string[]; // fetch users
  const teams = await Teams.find({ _id: { $in: teamMemberIds } })
  const create = await Projects.create(body);
  if (create) {

    const membersList: string[] = teams.map((member: any) => member.userId + "")
    const roomInfo = await createRoomForProject({
      roomName: create.title,
      roomId: create._id + "",
      membersId: membersList,
      relationShipManagerId: req?.user?.userId!
    })
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

//For Relationship Manager to see client's Projects
const fetchClientProject = asyncHandler(async (req: RequestUser, res) => {
  const checkRelationShipManager = await Users.exists({
    userId: req.body.userId,
    relationship_manager: req?.user?.userId,
  });

  if (checkRelationShipManager) {
    const projects = await Projects.find({ userId: req?.body.userId })
      .populate({
        path: "userId",
        select: "firebaseId role name email",
      })
      .populate({
        path: "orgId",
        select: "companyName contactPerson contactEmail contactMobile industry",
      });
    return new ApiResponse(200, projects, "Projects fetched successfully");
  } else {
    return new ApiResponse(401, null, "You are not assigned for this Customer");
  }
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
    userId: req.user?.userId,
    _id: projectId,
  });
  return new ApiResponse(200, project, "Project Fetched successfully");
});

export {
  createProject,
  fetchClientProject,
  fetchProject,
  updateProject,
  fetchProjectById,
  fetchClientProjectById,
};
