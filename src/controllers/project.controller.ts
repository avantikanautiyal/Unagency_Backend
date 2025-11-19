import Projects, { IProject } from "../models/projects.model";
import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import Teams from "../models/team.model";
import { createRoomForProject } from "../services/Chatstream";
import Organizations from "../models/organization.model";
import mongoose from "mongoose";
import { ApiError } from "../utils/apiError";
import { IStaff } from "../models/staff.model";
import { v6 as uuid6 } from "uuid";
import ChatRoom from "../models/chatRoom.model";
import ProjectLogs from "../models/projectlogs.model";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { Notification } from "../background/utils/notification";
import { EmailQueue } from "../background/queue/email.queue";
import { sendNotificationFCM } from "../utils/FCM";

/*----------------------------------{  for Servecing  }-----------------------------------------*/
//TESTED OK
const createProject = asyncHandler(async (req: RequestUser, res) => {
  const body: IProject = req.body;

  if (body.orgId) {
    const isExistOrgnization = await Organizations.exists({
      _id: new mongoose.Types.ObjectId(body.orgId),
      owner: body?.userId,
    });
    if (!isExistOrgnization) throw new ApiError("Invalid Organization Id", 404);
  }
  const customer = await Users.findById(body.userId);

  const teamMemberIds = body.clientTeam as string[]; // fetch users
  const teams = await Teams.find({ _id: { $in: teamMemberIds } }).populate(
    "userId"
  );
  const teamsEmail = teams.map((t: any) => t?.userId?.email);
  teamsEmail.push(customer?.email);
  const create = await Projects.create(body);

  EmailQueue.add("project creation", {
    action: "PROJECT",
    data: "NEW Project creation here",
    email: teamsEmail.join(","),
    userId: customer?._id.toString(),
    notification: new Notification({
      title: create.title,
      description: create.description,
      type: "PROJECT",
      action: "project.open",
      actionText: "view projects",
      symbol: "🍾",
    }),
    subject: "New Project " + create.title,
  });
  // currently sending a notificaiton to only a owner
  await sendNotificationFCM({
    notification: new Notification({
      title: create.title,
      description: create.description,
      type: "PROJECT",
      action: "project.open",
      actionText: "view projects",
      symbol: "🍾",
    }),
    user: customer as any,
  });
  await ProjectLogs.create({
    projectId: create?._id,
    ActionType: "planning",
    ActionDate: new Date(),
  });
  if (create) {
    const membersList: string[] = teams.map(
      (member: any) => member.userId + ""
    );
    if (!body.orgId)
      return new ApiResponse(
        200,
        { project: create },
        "Project created successfully"
      );
    const roomInfo = await createRoomForProject({
      roomName: create.title,
      roomId: uuid6(),
      project_id: create._id + "",
      membersId: [...membersList, req?.user?.userId!, body.userId + ""],
      relationShipManagerId: req?.user?.userId!,
    });
    ChatRoom.create({
      cid: roomInfo?.cid,
      project_id: create._id + "",
      room_type: "group",
      roomId: roomInfo?.roomId,
      members: [...membersList, req?.user?.userId!, body.userId + ""],
    });
    return new ApiResponse(
      200,
      { chatRoom: roomInfo, project: create },
      "Project created successfully"
    );
  }
});

//TESTED OK
export const FetchAssignedProjects = asyncHandler(
  async (req: RequestUser, res) => {
    const staff: IStaff = req.user?.staff as IStaff;
    if (!staff) throw new ApiError("You are not a staff", 400);
    const projects = await Projects.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $match: {
          "user.relationship_manager": staff?._id,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $project: {
          category: 1,
          title: 1,
          description: 1,
          startDate: 1,
          deadline: 1,
          status: 1,
          "user.name": 1,
          "user._id": 1,
          "user.email": 1,
        },
      },
    ]);

    return new ApiResponse(200, projects, "Project Fetched");
  }
);
// TESTED OK
const fetchProjectListByClientId = asyncHandler(
  async (req: RequestUser, res) => {
    const role = req.user?.role;
    if (role === "customer") {
      const projects = await Projects.find({ userId: req.user?.userId })
        .populate({
          path: "userId",
          select: "firebaseId role name email",
        })
        .populate({
          path: "category",
          select: "title",
        });
      return new ApiResponse(200, projects, "Projects fetched successfully");
    }

    if (role === "servicing") {
      const isMyCustomer = await Users.exists({
        _id: req?.params?.userId,
        relationship_manager: req.user?.staff,
      });
      if (!isMyCustomer) throw new ApiError("You are not a staff", 400);
    }
    const projects = await Projects.find({
      userId: req.params?.userId,
    });
    return new ApiResponse(200, projects, "Projects fetched successfully");
  }
);

//TESTED OK
const updateProject = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const body: IProject = req.body;

  const checkRelationShipManager = await Users.findOne({
    _id: body.userId,
    relationship_manager: req?.user?.staff,
  });

  if (checkRelationShipManager) {
    const update = await Projects.findOneAndUpdate(
      {
        userId: body.userId,
        _id: projectId,
      },
      {
        $set: {
          title: body.title,
          category: body.category,
          description: body?.description,
          startDate: body?.startDate,
          deadline: body?.deadline,
        },
      }
    );

    const teamMemberIds = update?.clientTeam as string[]; // fetch users
    const teams = await Teams.find({ _id: { $in: teamMemberIds } }).populate(
      "userId"
    );
    const teamsEmail = teams.map((t: any) => t?.userId?.email);
    const customer = await Users.findById(update?.userId);
    teamsEmail.push(customer?.email);

    EmailQueue.add("project update", {
      action: "PROJECT",
      data: "NEW Project Update here ",
      userId: customer?._id.toString(),
      email: teamsEmail.join(","),
      notification: new Notification({
        title: update?.title!,
        description: update?.description!,
        type: "PROJECT",
        action: "project.open",
        actionText: "view projects",
        symbol: "🍾",
      }),
      subject: `Project update (${update?.status}) ` + update?.title!,
    });
    // currently sending a notificaiton to only a owner
    await sendNotificationFCM({
      notification: new Notification({
        title: update?.title! + " (" + update?.status + ")",
        description: update?.description!,
        type: "PROJECT",
        action: "project.open",
        actionText: "view projects",
        symbol: "🍾",
      }),
      user: customer as any,
    });

    return new ApiResponse(200, update, "Project updated successfully");
  } else {
    return new ApiResponse(401, null, "You are not assigned for this Customer");
  }
});

//TESTED OK
const fetchProjectById = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const role = req.user?.role;
  if (role === "customer") {
    const project = await Projects.findOne({
      userId: req.user?.userId,
      _id: projectId,
    })
      .populate({
        path: "userId",
        select: "firebaseId role name email",
      })
      .populate({
        path: "clientTeam",
        select: "userId",
        populate: { path: "userId", select: ["name", "email"] },
      })
      .populate({
        path: "category",
        select: "title",
      });
    return new ApiResponse(200, project, "Project fetched successfully");
  }

  const project = await Projects.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(projectId), // Filter for the specific project ID
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        "user.relationship_manager": new mongoose.Types.ObjectId(
          (req?.user?.staff as IStaff)?._id
        ),
      },
    },
    { $limit: 1 },
    {
      $project: {
        _id: 1, // Include the project ID
        title: 1,
        category: 1,
        description: 1,
        startDate: 1,
        deadline: 1,
        clientTeam: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        user: {
          _id: "$user._id",
          name: "$user.name",
          email: "$user.email",
          image: "$user.image",
        },
        resource: 1, // Retain the resource field for lookup
      },
    },
    // {
    //   $lookup: {
    //     from: "staff", // Adjust this to the actual collection name for resources
    //     localField: "resource", // This is the field in the project that contains resource IDs
    //     foreignField: "_id",
    //     as: "resourceDetails",
    //   },
    // },
  ]);

  const singleProject = project?.length > 0 ? project[0] : null;
  return new ApiResponse(200, singleProject, "My Project fetched successfully");
});

//TESTED OK
/**------------------------------{ for Customer  }------------------------------------- */
const FetchMyProjects = asyncHandler(async (req: RequestUser, res) => {
  const userId: string = req?.user?.userId!;
  const projects = await Projects.find({
    userId: new mongoose.Types.ObjectId(userId as string),
  })
    .populate({
      path: "userId",
      select: "firebaseId role name email",
    })
    .populate({
      path: "category",
      select: "title",
    });
  return new ApiResponse(200, projects, "Projects fetched successfully");
});

//TESTED OK
const getProjectLogs = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  const logs = await ProjectLogs.find({
    projectId: projectId,
  });
  return new ApiResponse(200, logs, "Project Logs fetched successfully");
});

//TESTED OK
const createProjectLogs = asyncHandler(async (req: RequestUser, res) => {
  const projectId = req.params.projectId;
  const customerId = req.params.customerId;
  const stage = req.params.stage;
  const checkRelationShipManager = await Users.findOne({
    _id: customerId,
    relationship_manager: req?.user?.staff,
  });

  if (checkRelationShipManager) {
    const exists = await ProjectLogs.exists({
      projectId: projectId,
      ActionType: stage,
    });
    if (exists) {
      return new ApiResponse(409, null, "Already in records");
    }
    const update = await Projects.findByIdAndUpdate(projectId, {
      $set: { status: stage },
    });
    const create = await ProjectLogs.create({
      projectId: projectId,
      ActionDate: new Date(),
      ActionType: stage,
    });

    const teamMemberIds = update?.clientTeam as string[]; // fetch users
    const teams = await Teams.find({ _id: { $in: teamMemberIds } }).populate(
      "userId"
    );
    const teamsEmail = teams.map((t: any) => t?.userId?.email);
    const customer = await Users.findById(update?.userId);
    teamsEmail.push(customer?.email);

    EmailQueue.add("project update", {
      action: "PROJECT",
      data: "NEW Project Update here ",
      userId: customer?._id.toString(),
      email: teamsEmail.join(","),
      notification: new Notification({
        title: update?.title!,
        description: update?.description!,
        type: "PROJECT",
        action: "project.open",
        actionText: "view projects",
        symbol: "🍾",
      }),
      subject: `Project update (${update?.status}) ` + update?.title!,
    });
    // currently sending a notificaiton to only a owner
    await sendNotificationFCM({
      notification: new Notification({
        title: update?.title! + " (" + update?.status + ")",
        description: update?.description!,
        type: "PROJECT",
        action: "project.open",
        actionText: "view projects",
        symbol: "🍾",
      }),
      user: customer as any,
    });

    // await projectNotification.add("project update", {
    //   action: "UPDATE",
    //   data: {
    //     status: stage,
    //     // userId: staff?.userId?._id,
    //     userId: project?.userId,
    //   },
    //   notification: new Notification({
    //     title: project?.title!,
    //     description: project?.description!,
    //     type: "PROJECT",
    //     symbol: "🧙🏻‍♂️",
    //     action: "project.open",
    //     actionText: "view projects",
    //   }),
    // });

    return new ApiResponse(200, create, "Project log created successfully");
  } else {
    return new ApiResponse(401, null, "You are not assigned for this Customer");
  }
});

export {
  createProject,
  fetchProjectListByClientId,
  FetchMyProjects,
  updateProject,
  fetchProjectById,
  getProjectLogs,
  createProjectLogs,
};
