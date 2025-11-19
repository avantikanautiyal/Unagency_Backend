import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import Requirement, { IRequirement } from "../models/requestProject.model";
import mongoose from "mongoose";
import { projectNotification } from "../background/queue/projectNotification.queue";
import { Notification } from "../background/utils/notification";
import Staff from "../models/staff.model";
import { EmailQueue } from "../background/queue/email.queue";
import { sendNotificationFCM } from "../utils/FCM";

// TESTED OK
export const createRequirement = asyncHandler(async (req: RequestUser, res) => {
  const body: IRequirement = req.body;
  if (!body.title && !body.description)
    throw new ApiError("All fields are required", 400);
  const files = (req.files as any)?.map((file: any) => file.location);
  const requirementBody = {
    title: body.title,
    description: body.description,
    userId: new mongoose.Types.ObjectId(req.user?.userId),
    category: body.category,
    deadline: body.deadline,
    files: files ?? [],
  };

  // console.log(requirementBody) ;
  // return new ApiResponse(200,null,"");
  const newRequirement = await Requirement.create(requirementBody);
  const rm = await Staff.findOne({
    _id: new mongoose.Types.ObjectId(req.user?.relationship_manager + ""),
  }).populate("userId");


  // return new ApiResponse(200,{rm},"ok")
  // projectNotification.add(newRequirement._id.toString(), {
  //   action: "CREATE",
  //   data: {
  //     customer: req.user,
  //     manager: rm,
  //     requirment: newRequirement,
  //   },
  //   notification: new Notification({
  //     title: newRequirement.title,
  //     description: newRequirement.description,
  //     type: "REQUIRMENT",
  //     symbol: "🔔",
  //     action: "requirment.open",
  //     actionText: "view requirment",
  //   }),
  // });
  const rmUser = await Users.findOne({
    _id: new mongoose.Types.ObjectId(rm?.userId?._id + ""),
  });
  EmailQueue.add("user register", {
    action: "REQUIRMENT",
    data: "NEW Rquirement form  " + req.user?.name,
    email: rmUser?.email!,
    notification: new Notification({
      title: "NEW Rquirement form " + req.user?.name,
      description: "requirement notification text ehre",
      type: "REQUIRMENT",
      symbol: "🫡",
      action: "🔔",
      actionText: "view requirment",
    }),
    subject: "NEW Rquirement " + req.user?.name,
  });
  // await sendNotificationFCM({
  //   notification: new Notification({
  //     title: "NEW Rquirement form " + req.user?.name,
  //     description: "requirement notification text ehre",
  //     type: "REQUIRMENT",
  //     symbol: "🫡",
  //     action: "🔔",
  //     actionText: "view requirment",
  //   }),
  //   user: req.user!,
  // });
  return new ApiResponse(200, newRequirement, "success");
});

// TESTED OK
export const getRequirement = asyncHandler(async (req: RequestUser, res) => {
  const userId: string = req.user?.userId!;
  const requirement = await Requirement.find({
    userId: new mongoose.Types.ObjectId(userId),
  });
  return new ApiResponse(200, requirement, "Requirement fetched successfully");
});

/*------------------------------{ servicing }---------------------------------*/
//TESTED OK
export const getCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const checkMyCustomer = await Users.exists({
      relationship_manager: req.user?.staff,
      _id: userId,
    });

    if (
      !checkMyCustomer &&
      req.user?.role !== "superadmin" &&
      req.user?.role !== "admin"
    ) {
      return new ApiResponse(
        401,
        null,
        "Customer is not associated with your ID"
      );
    }
    const requirement = await Requirement.find({
      userId: new mongoose.Types.ObjectId(userId),
    }).populate("category");
    return new ApiResponse(
      200,
      requirement,
      "Requirement fetched successfully"
    );
  }
);

//TESTED OK
export const updateCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const reqId: string = req.params.reqId;
    const status: string = req.params.status;
    const checkMyCustomer = await Users.exists({
      relationship_manager: req.user?.staff,
      _id: userId,
    });

    if (!checkMyCustomer) {
      return new ApiResponse(
        401,
        null,
        "Customer is not associated with your ID"
      );
    }
    const update = await Requirement.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(reqId), userId: userId },
      { $set: { status: status } },
      { new: true, runValidators: true }
    );
    const customer = await Users.findOne({_id : userId});

    EmailQueue.add("requirment update", {
      action: "REQUIRMENT",
      data: "Rquirement update  " +update?.title,
      email: customer?.email!,
      notification: new Notification({
        title: "NEW Rquirement form " + req.user?.name,
        description: "requirement notification text ehre",
        type: "REQUIRMENT",
        symbol: "🫡",
        action: "🔔",
        actionText: "view requirment",
      }),
      subject: "NEW Rquirement " + update?.title,
    });

    await sendNotificationFCM({
      notification: new Notification({
        title: "Rquirement Update " + update?.title,
        description: "requirement notification text ehre",
        type: "REQUIRMENT",
        symbol: "🫡",
        action: "🔔",
        actionText: "view requirment",
      }),
      user: {userId : customer?._id! ,...customer} as any,
    });
    return new ApiResponse(200, update, "Requirement updated successfully");
  }
);

export const getRequirmentById = asyncHandler(async (req : RequestUser)=> {
  const id: string = req.params.id;
 const requirment =  await Requirement.findById(id);
 return new ApiResponse(200 , requirment ,"Requirment fetch sucessfully");
})
