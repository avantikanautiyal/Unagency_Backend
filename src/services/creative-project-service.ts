/**
 * Customer AI Create Design → Projects list wiring.
 * Creates/updates a lightweight project so Home/Projects show real status.
 */

import mongoose from "mongoose";
import Categories from "../models/categories.model";
import Organizations from "../models/organization.model";
import Projects, { type IProject } from "../models/projects.model";
import { ApiError } from "../utils/apiError";

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

const ALLOWED_STATUSES = new Set([
  "planning",
  "initiated",
  "on-hold",
  "revision",
  "delivered",
  "approved",
  "closed",
]);

async function resolveOrgId(userId: string, orgId?: string): Promise<string | undefined> {
  if (orgId && mongoose.isValidObjectId(orgId)) {
    const exists = await Organizations.exists({
      _id: new mongoose.Types.ObjectId(orgId),
      owner: userId,
    });
    if (exists) return orgId;
  }
  const owned = await Organizations.findOne({ owner: userId })
    .select("_id")
    .lean();
  return owned?._id?.toString();
}

async function resolveCategoryId(input: {
  categoryId?: string;
  service?: string;
  categoryTitle?: string;
}): Promise<mongoose.Types.ObjectId> {
  if (input.categoryId && mongoose.isValidObjectId(input.categoryId)) {
    const found = await Categories.findById(input.categoryId).select("_id");
    if (found) return found._id as mongoose.Types.ObjectId;
  }

  const title =
    (input.categoryTitle && input.categoryTitle.trim()) ||
    (input.service && SERVICE_TO_CATEGORY[input.service.trim().toLowerCase()]) ||
    "AI";

  let category = await Categories.findOne({ title });
  if (!category) {
    category = await Categories.create({
      title,
      featuredImage: "",
      tags: ["ai", "creative"],
      tagline: "service",
    });
  }
  return category._id as mongoose.Types.ObjectId;
}

function defaultDeadline(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 14);
  return d;
}

export type CreativeProjectInput = {
  userId: string;
  orgId?: string;
  title: string;
  description?: string;
  status?: string;
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  category?: string;
  categoryId?: string;
  categoryTitle?: string;
  executionId?: string;
  /** Prior execution in the same creative session (e.g. refine). Upsert updates that project. */
  refineFromExecutionId?: string;
  projectId?: string;
  /** When true, keep the existing project title on update. */
  preserveTitle?: boolean;
  sourceRouteId?: string;
  artifactId?: string;
  brandId?: string;
  productPath?: string;
  resumeStep?: string;
  prompt?: string;
};

export type CreativeProjectDto = {
  id: string;
  title: string;
  description: string;
  status: string;
  executionId?: string;
  sourceRouteId?: string;
  artifactId?: string;
  productPath?: string;
  resumeStep?: string;
  service?: string;
  subtype?: string;
  platform?: string;
  format?: string;
  category?: string;
  prompt?: string;
  brandId?: string;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
};

function applyProductFields(
  doc: IProject,
  input: Partial<CreativeProjectInput>,
): void {
  if (input.resumeStep) doc.resumeStep = input.resumeStep;
  if (input.service) doc.productService = input.service;
  if (input.subtype) doc.productSubtype = input.subtype;
  if (input.platform) doc.productPlatform = input.platform;
  if (input.format) doc.productFormat = input.format;
  if (input.category) doc.productCategory = input.category;
  if (input.prompt?.trim()) doc.creativePrompt = input.prompt.trim();
  if (input.productPath) doc.productPath = input.productPath;
  if (input.sourceRouteId) doc.sourceRouteId = input.sourceRouteId;
  if (input.artifactId) doc.artifactId = input.artifactId;
  if (input.brandId && mongoose.isValidObjectId(input.brandId)) {
    doc.brandId = new mongoose.Types.ObjectId(input.brandId);
  }
}

function toDto(doc: IProject & { createdAt?: Date; updatedAt?: Date }): CreativeProjectDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    status: doc.status,
    executionId: doc.executionId,
    sourceRouteId: doc.sourceRouteId,
    artifactId: doc.artifactId,
    productPath: doc.productPath,
    resumeStep: doc.resumeStep,
    service: doc.productService,
    subtype: doc.productSubtype,
    platform: doc.productPlatform,
    format: doc.productFormat,
    category: doc.productCategory,
    prompt: doc.creativePrompt || doc.description,
    brandId: doc.brandId?.toString?.(),
    origin: doc.origin,
    createdAt: doc.createdAt?.toISOString?.(),
    updatedAt: doc.updatedAt?.toISOString?.(),
  };
}

export class CreativeProjectService {
  async upsert(input: CreativeProjectInput): Promise<CreativeProjectDto> {
    const title = String(input.title ?? "").trim();
    if (!title) throw new ApiError("title is required", 400);

    const statusRaw = String(input.status ?? "initiated").trim();
    const status = ALLOWED_STATUSES.has(statusRaw) ? statusRaw : "initiated";
    const description =
      String(input.description ?? "").trim() ||
      `AI creative project: ${title}`;
    const orgId = await resolveOrgId(input.userId, input.orgId);
    const category = await resolveCategoryId({
      categoryId: input.categoryId,
      service: input.service,
      categoryTitle: input.categoryTitle,
    });

    const executionId = input.executionId?.trim() || undefined;
    const refineFromExecutionId =
      input.refineFromExecutionId?.trim() || undefined;
    const projectId = input.projectId?.trim() || undefined;
    const preserveTitle = Boolean(input.preserveTitle);
    const now = new Date();
    const userOid = new mongoose.Types.ObjectId(input.userId);

    let existing =
      (executionId
        ? await Projects.findOne({ userId: userOid, executionId })
        : null) ||
      (refineFromExecutionId
        ? await Projects.findOne({
            userId: userOid,
            executionId: refineFromExecutionId,
          })
        : null) ||
      (projectId && mongoose.isValidObjectId(projectId)
        ? await Projects.findOne({ _id: projectId, userId: userOid })
        : null);

    if (existing) {
      // Drop orphans created when refine previously inserted a second project.
      if (executionId && String(existing.executionId) !== executionId) {
        await Projects.deleteMany({
          userId: userOid,
          origin: "ai_creative",
          executionId,
          _id: { $ne: existing._id },
        });
      }
      if (!preserveTitle) {
        existing.title = title;
      }
      existing.description = description;
      existing.status = status;
      existing.origin = "ai_creative";
      if (executionId) existing.executionId = executionId;
      applyProductFields(existing, input);
      await existing.save();
      return toDto(existing as any);
    }

    const created = await Projects.create({
      userId: new mongoose.Types.ObjectId(input.userId),
      ...(orgId ? { orgId: new mongoose.Types.ObjectId(orgId) } : {}),
      title,
      description,
      category,
      startDate: now,
      deadline: defaultDeadline(now),
      status,
      origin: "ai_creative",
      executionId,
      sourceRouteId: input.sourceRouteId?.trim() || undefined,
      artifactId: input.artifactId?.trim() || undefined,
      productPath: input.productPath?.trim() || undefined,
      resumeStep: input.resumeStep?.trim() || "generating",
      productService: input.service?.trim() || undefined,
      productSubtype: input.subtype?.trim() || undefined,
      productPlatform: input.platform?.trim() || undefined,
      productFormat: input.format?.trim() || undefined,
      productCategory: input.category?.trim() || undefined,
      creativePrompt: input.prompt?.trim() || undefined,
      ...(input.brandId && mongoose.isValidObjectId(input.brandId)
        ? { brandId: new mongoose.Types.ObjectId(input.brandId) }
        : {}),
      files: [],
      resource: [],
      clientTeam: [],
    });

    return toDto(created as any);
  }

  async updateStatus(input: {
    userId: string;
    projectId: string;
    status: string;
    artifactId?: string;
    sourceRouteId?: string;
    title?: string;
    description?: string;
    resumeStep?: string;
    prompt?: string;
  }): Promise<CreativeProjectDto> {
    if (!mongoose.isValidObjectId(input.projectId)) {
      throw new ApiError("Invalid project id", 400);
    }
    const status = String(input.status ?? "").trim();
    if (!ALLOWED_STATUSES.has(status)) {
      throw new ApiError("Invalid project status", 400);
    }

    const doc = await Projects.findOne({
      _id: input.projectId,
      userId: input.userId,
    });
    if (!doc) throw new ApiError("Project not found", 404);

    doc.status = status;
    if (input.artifactId) doc.artifactId = input.artifactId;
    if (input.sourceRouteId) doc.sourceRouteId = input.sourceRouteId;
    if (input.title?.trim()) doc.title = input.title.trim();
    if (input.description?.trim()) doc.description = input.description.trim();
    if (input.resumeStep) doc.resumeStep = input.resumeStep;
    if (input.prompt?.trim()) doc.creativePrompt = input.prompt.trim();
    await doc.save();
    return toDto(doc as any);
  }
}

export const creativeProjectService = new CreativeProjectService();
