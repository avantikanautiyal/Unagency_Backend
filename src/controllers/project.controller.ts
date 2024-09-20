import Projects, { IProject } from "../models/projects.model";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const createProject = asyncHandler(async (req, res) => {
  const body: IProject = req.body;
  const isExist = await Projects.exists({
    userId: body.userId,
    title: body.title,
  });
  if (isExist) {
    return new ApiResponse(409, null, "Project already exists");
  }

  const create = await Projects.create(body);
  if (create) {
    return new ApiResponse(200, create, "Project created successfully");
  }
});

//For Customer to see their Projects
const fetchProject = asyncHandler(async (req: RequestUser, res) => {
  const projects = await Projects.find({ userId: req?.user?.userId })
    .populate({
      path: "userId",
      select: "firebaseId role name email",
    })
    .populate({
      path: "orgId",
      select: "companyName contactPerson contactEmail contactMobile industry",
    });
  return new ApiResponse(200, projects, "Projects fetched successfully");
});

//For Relationship Manager to see client's Projects
const fetchClientProject = asyncHandler(async (req: RequestUser, res) => {
  const checkRelationShipManager = await Users.findOne({
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

  const checkRelationShipManager = await Users.findOne({
    userId: body.userId,
    relationship_manager: req?.user?.userId,
  });
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
