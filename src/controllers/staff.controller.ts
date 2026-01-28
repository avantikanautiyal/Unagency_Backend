import mongoose from "mongoose";
import Staff, { IStaff } from "../models/staff.model";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import Users from "../models/users.model";
import { createDistincChatRoom } from "../services/Chatstream";
import { EmailQueue } from "../background/queue/email.queue";
import { Notification } from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES } from "../utils/constant/emailConstants";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;

// TESTED OK
const createStaff = asyncHandler(async (req, res) => {
  const staffData: IStaff = req.body;
  const isExist = await Staff.exists({ userId: staffData.userId });
  if (isExist) {
    return new ApiResponse(409, null, "Already user exists");
  }

  const create = await Staff.create(staffData);
  return new ApiResponse(200, create, "Staff created successfully");
});
// TESTED OK
const deleteStaff = asyncHandler(async (req, res) => {
  const staffId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    return new ApiResponse(400, null, "Invalid staff ID");
  }
  const deletedStaff = await Staff.findByIdAndDelete(staffId);
  if (!deletedStaff) {
    return new ApiResponse(404, null, "Staff not found");
  }

  return new ApiResponse(200, null, "Staff deleted successfully");
});
// TESTED OK
const updateStaff = asyncHandler(async (req, res) => {
  const staffId = req.params.id;
  const updateData: IStaff = req.body;
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    return new ApiResponse(400, null, "Invalid staff ID");
  }

  const updatedStaff = await Staff.findByIdAndUpdate(
    staffId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!updatedStaff) {
    return new ApiResponse(404, null, "Staff not found");
  }
  return new ApiResponse(200, updateStaff, "Staff Data updated successfully");
});
// TESTED OK
const fetchStaff = asyncHandler(async (req, res) => {
  const staffList = await Staff.find({}).populate({
    path: "userId",
    select: "firebaseId role name email", // Only include `name` and `email` from User
  });
  return new ApiResponse(200, staffList, "Staff list fetched successfully");
});
// TESTED OK
const fetchStaffById = asyncHandler(async (req, res) => {
  const staffId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    return new ApiResponse(400, null, "Invalid staff ID");
  }

  const staff = await Staff.findById(staffId);
  if (!staff) {
    return new ApiResponse(404, null, "Staff not found");
  }
  return new ApiResponse(200, staff, "Staff fetched successfully");
});

const AssignManagerToCustomer = asyncHandler(async (req, res) => {
  const { customerId, staffId } = req.body;
  if (!customerId || !staffId) {
    return new ApiResponse(400, null, "All fields are required");
  }
  const checkCustomer = await Users.findOne({ _id: customerId });
  if (!checkCustomer) {
    return new ApiResponse(400, null, "Customer is invalid");
  }

  const checkStaff = await Staff.findOne({ _id: staffId }).populate("userId");
  if (!checkStaff) {
    return new ApiResponse(400, null, "Staff ID is invalid");
  }

  checkCustomer.relationship_manager = staffId;
  await createDistincChatRoom({
    roomName: `${(checkStaff?.userId as any)?.name}, ${checkCustomer.name}`,
    members: [
      checkStaff.userId._id + "",
      checkCustomer._id + "",
    ],
    createdBy: checkCustomer._id + "",
    room_type: "personal",
    isCustomer: true,
  }); //CReating a Channel between Customer and Relationship Manager

  await checkCustomer.save();

  // Notify CS about assignment
  EmailQueue.add("CS assigned to client", {
    action: "COMMON",
    data: commonTemplate({
      title: "New client assigned",
      content: IN_APP_NOTIFICATION_MESSAGES.CS_ASSIGNED_TO_CLIENT,
      name: (checkStaff?.userId as any)?.name!,
      buttonText: "View Client",
      buttonLink: `${FRONTEND_URL}/customers/${checkCustomer?._id}`,
    }),
    email: (checkStaff?.userId as any)?.email!,
    userId: (checkStaff?.userId as any)?._id.toString(),
    notification: new Notification({
      title: "New client assigned",
      description: IN_APP_NOTIFICATION_MESSAGES.CS_ASSIGNED_TO_CLIENT,
      type: "COMMON",
      action: "customer.view",
      actionText: "view client",
      symbol: "🤝",
    }),
    subject: "New client assigned",
  });

  return new ApiResponse(200, null, "Manager is assigned successfully");
});

export {
  createStaff,
  fetchStaffById,
  fetchStaff,
  updateStaff,
  deleteStaff,
  AssignManagerToCustomer,
};
