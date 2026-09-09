import Users from "../models/users.model";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import Requirement, { IRequirement } from "../models/requestProject.model";
import mongoose from "mongoose";
import { Notification } from "../background/utils/notification";
import Staff from "../models/staff.model";
import { EmailQueue } from "../background/queue/email.queue";

import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { parseNotificationContent } from "../utils/notificationUtils";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;

import { checkPlanLimit } from "../services/planLimit.service";
import {
  assignCsToRequirement,
  isHumanHybridCreationMode,
  servicingCanAccessCustomer,
} from "../services/cs-assignment-service";

async function notifyAssignedCs(input: {
  requirementId: string;
  staffId: mongoose.Types.ObjectId | string;
  title: string;
  description?: string;
}) {
  const staff = await Staff.findById(input.staffId).populate("userId");
  const csUser = staff?.userId as
    | { _id?: { toString(): string }; name?: string; email?: string }
    | null
    | undefined;
  if (!csUser?.email || !staff?.userId) return;

  EmailQueue.add(`NEW_SERVICE_REQ_${csUser.email}`, {
    action: "REQUIRMENT",
    data: commonTemplate({
      title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
      content: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_body,
      name: csUser.name!,
      buttonText: "View Inbox",
      buttonLink: `${FRONTEND_URL}/cs/inbox`,
    }),
    email: csUser.email,
    userId: csUser._id?.toString?.() ?? String(staff.userId),
    notification: new Notification({
      title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_title,
      description: input.description ?? NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_body,
      type: "REQUIRMENT",
      _id: input.requirementId,
      symbol: "📋",
      action: `${FRONTEND_URL}/cs/inbox`,
      actionText: "view inbox",
    }),
    subject: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
  });
}

async function ensureServiceChannel(input: {
  userId: string;
  brandId: string;
  productPath: string;
  serviceLabel?: string;
  assignedCsStaffId?: string;
}) {
  const { collaborationChannelService } = await import(
    "../services/collaboration/collaboration-channel-service"
  );
  await collaborationChannelService.ensureForService(input);
}

// TESTED OK
export const createRequirement = asyncHandler(async (req: RequestUser, res) => {
  // Check Plan Limit
  await checkPlanLimit(req.user?.userId!, undefined, "CREATE_BRIEF");

  const body: IRequirement = req.body;
  if (!body.title && !body.description)
    throw new ApiError("All fields are required", 400);
  const files = (req.files as any)?.map((file: any) => file.location) ?? [];

  // M10.4 — accept product asset ids (server-validated ownership)
  const assetIdsRaw = (req.body as { assetIds?: string | string[] }).assetIds;
  const assetIds = Array.isArray(assetIdsRaw)
    ? assetIdsRaw.map(String)
    : typeof assetIdsRaw === "string" && assetIdsRaw.trim()
      ? assetIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (assetIds.length > 0) {
    const { productAssetService } = await import(
      "../services/product-asset-service"
    );
    for (const assetId of assetIds) {
      await productAssetService.get({
        userId: String(req.user?.userId),
        assetId,
      });
    }
  }

  const creationModeRaw = String(
    (req.body as { creationMode?: string; productMode?: string }).creationMode ||
      (req.body as { productMode?: string }).productMode ||
      ""
  )
    .toLowerCase()
    .trim();
  const creationMode =
    creationModeRaw === "human" ||
    creationModeRaw === "hybrid" ||
    creationModeRaw === "ai"
      ? creationModeRaw
      : undefined;
  const brandIdRaw = String(
    (req.body as { brandId?: string }).brandId || ""
  ).trim();
  const productPath = String(
    (req.body as { productPath?: string }).productPath || ""
  ).trim();

  // Legacy installs may still have unique title index — drop if present.
  try {
    await Requirement.collection.dropIndex("title_1");
  } catch {
    // index may not exist
  }

  const requirementBody: Record<string, unknown> = {
    title: body.title,
    description: body.description,
    userId: new mongoose.Types.ObjectId(req.user?.userId),
    category: body.category,
    deadline: body.deadline,
    files: [...files, ...assetIds],
  };
  if (creationMode) requirementBody.creationMode = creationMode;
  if (brandIdRaw && mongoose.isValidObjectId(brandIdRaw)) {
    requirementBody.brandId = new mongoose.Types.ObjectId(brandIdRaw);
  }
  if (productPath) requirementBody.productPath = productPath;

  // console.log(requirementBody) ;
  // return new ApiResponse(200,null,"");
  const newRequirement = await Requirement.create(requirementBody);

  if (creationMode && isHumanHybridCreationMode(creationMode)) {
    const assigned = await assignCsToRequirement(newRequirement._id);
    if (assigned) {
      void notifyAssignedCs({
        requirementId: newRequirement._id.toString(),
        staffId: assigned.staffId,
        title: body.title,
      });
    }
  } else {
    const rm = await Staff.findOne({
      _id: new mongoose.Types.ObjectId(req.user?.relationship_manager + ""),
    }).populate("userId");

    const rmUser = await Users.findOne({
      _id: new mongoose.Types.ObjectId(rm?.userId?._id + ""),
    });
    if (rmUser?.email && rm?.userId) {
      EmailQueue.add(`NEW_RQUIREMENT_${rmUser.email}`, {
        action: "REQUIRMENT",
        data: commonTemplate({
          title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
          content: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_body,
          name: rmUser.name!,
          buttonText: "View Brief",
          buttonLink: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
        }),
        email: rmUser.email,
        userId: rm.userId._id.toString(),
        notification: new Notification({
          title: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_title,
          description: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.in_app_body,
          type: "REQUIRMENT",
          _id: newRequirement._id.toString(),
          symbol: "📋",
          action: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
          actionText: "view brief",
        }),
        subject: NOTIFICATION_CONFIG.CS_BRIEF_SUBMITTED.email_subject,
      });
    }
  }

  // sending email to customer
  const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_body, { Name: req.user?.name || "User" });
  EmailQueue.add(`NEW_RQUIREMENT_${req.user?.email}`, {
    action: "REQUIRMENT",
    data: commonTemplate({
      title: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_subject,
      content: notificationData.text,
      name: req.user?.name!,
      buttonText: notificationData.cta,
      buttonLink: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
    }),
    email: req.user?.email!,
    userId: req.user?.userId.toString()!,
    notification: new Notification({
      title: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.in_app_title,
      description: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.in_app_body,
      type: "REQUIRMENT",
      _id: newRequirement._id.toString(),
      symbol: "🫡",
      action: `${FRONTEND_URL}/requirement-logs/${newRequirement._id}`,
      actionText: "view requirment",
    }),
    subject: NOTIFICATION_CONFIG.BRIEF_SUBMITTED.email_subject,
  });

  // M10.19 — auto-provision brief collaboration channel (non-blocking)
  void (async () => {
    try {
      const { collaborationChannelService } = await import(
        "../services/collaboration/collaboration-channel-service"
      );
      if (!collaborationChannelService.isConfigured()) return;
      const orgId =
        (req.user?.organization as { _id?: { toString(): string } } | null)?._id?.toString() ||
        "";
      const members = [String(req.user?.userId)];

      let assignedCsStaffId: string | undefined;
      if (creationMode && isHumanHybridCreationMode(creationMode)) {
        const assignedReq = await Requirement.findById(newRequirement._id).select(
          "assignedCs"
        );
        assignedCsStaffId = assignedReq?.assignedCs
          ? String(assignedReq.assignedCs)
          : undefined;
        if (assignedCsStaffId) {
          const staff = await Staff.findById(assignedCsStaffId).select("userId");
          if (staff?.userId) members.push(String(staff.userId));
        }
      } else {
        const rm = await Staff.findOne({
          _id: new mongoose.Types.ObjectId(req.user?.relationship_manager + ""),
        }).populate("userId");
        const rmUser = rm?.userId as { _id?: unknown } | null | undefined;
        if (rmUser?._id) members.push(String(rmUser._id));
      }

      await collaborationChannelService.provisionForBrief({
        briefId: newRequirement._id.toString(),
        name: String(newRequirement.title || "Brief"),
        organizationId: orgId || String(req.user?.userId),
        memberUserIds: members,
        createdByUserId: String(req.user?.userId),
        brandId: brandIdRaw || undefined,
      });
      if (brandIdRaw && productPath) {
        await collaborationChannelService.ensureForService({
          userId: String(req.user?.userId),
          brandId: brandIdRaw,
          productPath,
          serviceLabel: String(newRequirement.title || ""),
          assignedCsStaffId,
        });
      }
    } catch (err) {
      console.warn(
        "[requirement] collaboration channel provision failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
    }
  })();

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
    const staffId =
      req.user?.staff &&
      typeof req.user.staff === "object" &&
      "_id" in req.user.staff
        ? req.user.staff._id
        : req.user?.staff;

    const canAccess = await servicingCanAccessCustomer({
      staffId,
      customerId: userId,
      role: req.user?.role,
    });

    if (!canAccess) {
      return new ApiResponse(
        401,
        null,
        "Customer is not associated with your ID"
      );
    }

    const requirementQuery: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (req.user?.role === "servicing") {
      requirementQuery.creationMode = { $in: ["human", "hybrid"] };
    }

    const requirement = await Requirement.find(requirementQuery).populate(
      "category"
    );
    return new ApiResponse(
      200,
      requirement,
      "Requirement fetched successfully"
    );
  }
);

export const getCsInboxRequirements = asyncHandler(
  async (req: RequestUser, res) => {
    const staffId =
      req.user?.staff &&
      typeof req.user.staff === "object" &&
      "_id" in req.user.staff
        ? req.user.staff._id
        : req.user?.staff;

    if (!staffId) {
      throw new ApiError("CS staff profile is required", 401);
    }

    const staffObjectId = new mongoose.Types.ObjectId(String(staffId));

    const legacyCustomerIds = await Users.find({
      role: "customer",
      relationship_manager: staffObjectId,
    }).distinct("_id");

    const requirements = await Requirement.find({
      $and: [
        { creationMode: { $in: ["human", "hybrid"] } },
        {
          $or: [
            { assignedCs: staffObjectId },
            {
              $or: [{ assignedCs: { $exists: false } }, { assignedCs: null }],
              userId: { $in: legacyCustomerIds },
            },
          ],
        },
      ],
    })
      .sort({ updatedAt: -1 })
      .populate("category")
      .populate({
        path: "assignedCs",
        select: "userId",
        populate: { path: "userId", select: ["name", "email"] },
      });

    const unassignedIds = requirements
      .filter((row) => !row.assignedCs)
      .map((row) => row._id);
    if (unassignedIds.length) {
      void Requirement.updateMany(
        { _id: { $in: unassignedIds } },
        { $set: { assignedCs: staffObjectId } }
      ).catch(() => undefined);
    }

    return new ApiResponse(200, requirements, "CS inbox fetched successfully");
  }
);

//TESTED OK
export const updateCustomerRequirement = asyncHandler(
  async (req: RequestUser, res) => {
    const userId: string = req.params.userId;
    const reqId: string = req.params.reqId;
    const status: string = req.params.status;
    const staffId =
      req.user?.staff &&
      typeof req.user.staff === "object" &&
      "_id" in req.user.staff
        ? req.user.staff._id
        : req.user?.staff;

    const checkMyCustomer = await servicingCanAccessCustomer({
      staffId,
      customerId: userId,
      role: req.user?.role,
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
    const customer = await Users.findOne({ _id: userId });

    // Use dynamic logic here for approved/closed states if needed, but for now assuming this is general update or specific state
    // If status is specific, should use specific config. Assuming "REQUIRMENT_CLOSED" maps to BRIEF_APPROVED or similar if status is approved.

    EmailQueue.add(`REQUIRMENT_UPDATE_${customer?.email}`, {
      action: "REQUIRMENT",
      data: commonTemplate({
        title: NOTIFICATION_CONFIG.CS_BRIEF_APPROVED.email_subject, // Using CS_BRIEF_APPROVED as it implies approval/update
        content: NOTIFICATION_CONFIG.CS_BRIEF_APPROVED.email_body,
        // User asked to implement CS Notifications. This block is notifying CUSTOMER ("sending email to customer" - implied by EmailQueue.add(..., customer.email)).
        // However, we should check if we need to notify CS here too.
        name: req.user?.name!,
        buttonText: "View Requirement",
        buttonLink: `${FRONTEND_URL}/requirement-logs/${update?._id}`,
      }),
      email: customer?.email!,
      userId: customer?._id.toString()!,
      notification: new Notification({
        title: `Your brief just touched down at UNAGENCY`,
        description: IN_APP_NOTIFICATION_MESSAGES.REQUIRMENT_CLOSED,
        _id: update?._id.toString()!,
        type: "REQUIRMENT",
        symbol: "🫡",
        action: `${FRONTEND_URL}/requirement-logs/${update?._id}`,
        actionText: "view requirment",
      }),
      subject: `Your brief just touched down at UNAGENCY | ${update?.title}`,
    });


    return new ApiResponse(200, update, "Requirement updated successfully");
  }
);

export const getRequirmentById = asyncHandler(async (req: RequestUser) => {
  const id: string = req.params.id;
  const requirment = await Requirement.findById(id)
    .populate("userId")
    .populate("category");
  return new ApiResponse(200, requirment, "Requirment fetch sucessfully");
});

const SERVICE_TO_CATEGORY: Record<string, string> = {
  social: "Social Media",
  website: "Website",
  branding: "Logo",
  packaging: "Packaging",
  print: "Performance Marketing",
  video: "Video",
  presentations: "Brand Identity",
  email: "Email Marketing",
  pos: "Brand Identity",
  merchandise: "Brand Identity",
  illustration: "Brand Identity",
  photography: "Photography",
  strategy: "Brand Identity",
  ads: "Performance Marketing",
  event: "Brand Identity",
};

/**
 * Human / Hybrid mode: open (or reuse) a CS inbox requirement bound to
 * brand + productPath so admin portals see servicing work, not AI Create Design.
 * POST /requirement/open-service
 */
export const openServiceRequirement = asyncHandler(
  async (req: RequestUser) => {
    // Human/Hybrid servicing intake must reach CS even without an active paid plan.
    // Formal Create Brief still enforces plan limits via createRequirement.

    const userId = String(req.user?.userId || "");
    const brandId = String(req.body?.brandId || "").trim();
    const productPath = String(req.body?.productPath || "").trim();
    const serviceLabel = String(req.body?.serviceLabel || "").trim();
    const creationModeRaw = String(
      req.body?.creationMode || req.body?.productMode || "human"
    )
      .toLowerCase()
      .trim();
    const creationMode =
      creationModeRaw === "hybrid" ? "hybrid" : "human";

    if (!userId) throw new ApiError("Unauthorized", 401);
    if (!brandId || !mongoose.isValidObjectId(brandId)) {
      throw new ApiError("brandId is required", 400);
    }
    if (!productPath || productPath === "unspecified") {
      throw new ApiError("productPath is required", 400);
    }

    try {
      await Requirement.collection.dropIndex("title_1");
    } catch {
      // index may not exist
    }

    const existing = await Requirement.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      brandId: new mongoose.Types.ObjectId(brandId),
      productPath,
      creationMode: { $in: ["human", "hybrid"] },
      status: { $nin: ["closed", "cancelled", "rejected"] },
    })
      .sort({ updatedAt: -1 })
      .populate("category");

    if (existing) {
      if (existing.creationMode !== creationMode) {
        existing.creationMode = creationMode;
        await existing.save();
      }

      let assignedStaffId = existing.assignedCs
        ? String(existing.assignedCs)
        : "";
      if (!assignedStaffId) {
        const assigned = await assignCsToRequirement(existing._id);
        if (assigned) {
          assignedStaffId = String(assigned.staffId);
          existing.assignedCs = assigned.staffId;
        }
      }

      void ensureServiceChannel({
        userId,
        brandId,
        productPath,
        serviceLabel: serviceLabel || undefined,
        assignedCsStaffId: assignedStaffId || undefined,
      }).catch((err) => {
        console.warn(
          "[requirement] open-service channel ensure failed (non-fatal):",
          err instanceof Error ? err.message : err
        );
      });

      const populatedExisting = await Requirement.findById(existing._id).populate(
        "category"
      );
      return new ApiResponse(
        200,
        populatedExisting ?? existing,
        "Service requirement ready"
      );
    }

    const { brandService } = await import("../services/brand-service");
    const Categories = (await import("../models/categories.model")).default;
    const brand = await brandService.get({ userId, brandId });
    const serviceKey = productPath.split("/")[0]?.toLowerCase() || "";
    const categoryTitle =
      SERVICE_TO_CATEGORY[serviceKey] ||
      serviceLabel ||
      productPath.split("/").filter(Boolean).join(" · ") ||
      "Creative";

    let category = await Categories.findOne({ title: categoryTitle });
    if (!category) {
      category = await Categories.create({
        title: categoryTitle,
        featuredImage: "",
        tags: ["human", "servicing"],
        tagline: "service",
      });
    }

    const label =
      serviceLabel ||
      productPath.split("/").filter(Boolean).join(" · ") ||
      "Service";
    const title = `${brand.name} · ${label}`;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);

    const created = await Requirement.create({
      userId: new mongoose.Types.ObjectId(userId),
      category: category._id,
      title,
      description:
        "Brief will be built from the client ↔ CS chat for this brand and service.",
      deadline,
      files: [],
      status: "raised",
      creationMode,
      brandId: new mongoose.Types.ObjectId(brandId),
      productPath,
    });

    const assigned = await assignCsToRequirement(created._id);
    const assignedStaffId = assigned ? String(assigned.staffId) : "";

    if (assigned) {
      void notifyAssignedCs({
        requirementId: created._id.toString(),
        staffId: assigned.staffId,
        title,
        description: `${title} — human/hybrid servicing request`,
      });
    }

    void ensureServiceChannel({
      userId,
      brandId,
      productPath,
      serviceLabel: label,
      assignedCsStaffId: assignedStaffId || undefined,
    }).catch((err) => {
      console.warn(
        "[requirement] open-service channel ensure failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
    });

    const populated = await Requirement.findById(created._id).populate(
      "category"
    );
    return new ApiResponse(200, populated ?? created, "Service requirement opened");
  }
);
