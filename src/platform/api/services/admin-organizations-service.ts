/**
 * Admin organization directory — one row per registered organization with
 * accurate owner, membership, activity, and billing fields.
 */

import mongoose from "mongoose";
import Organizations from "../../../models/organization.model";
import Users from "../../../models/users.model";
import Staff from "../../../models/staff.model";
import Projects from "../../../models/projects.model";
import Requirement from "../../../models/requestProject.model";
import Subscriptions from "../../../models/subscription.model";
import Teams from "../../../models/team.model";
import Tasks from "../../../models/tasks.model";
import Brands from "../../../models/brand.model";
import Categories from "../../../models/categories.model";
import MediaFile from "../../../models/mediaFile.model";
import { PlansModel } from "../../../models/plan.model";
import type { OrgBillingRow } from "./admin-billing-analytics-service";
import { resolveProjectAiProvidersBatch } from "./admin-execution-providers-service";
import {
  isDemoCustomerUserId,
  isDemoOrgName,
  isDemoOrganizationId,
  isDemoTitle,
  loadAdminDemoExclusions,
} from "./admin-demo-filter";

export type AdminOrganizationRow = {
  organizationId: string;
  customerUserId: string;
  companyName: string;
  industry: string;
  contactPerson: string;
  contactEmail: string;
  ownerName: string;
  managerName: string;
  memberSince: string;
  activeReq: number;
  membership: string;
  revenueMtd: number;
  aiCostMtd: number;
  humanCostMtd: number;
  memberCount: number;
};

function isActiveStatus(status?: string): boolean {
  const value = (status ?? "").toLowerCase();
  if (!value) return true;
  return !(
    value.includes("complete") ||
    value.includes("closed") ||
    value.includes("delivered") ||
    value.includes("approved") ||
    value.includes("cancel")
  );
}

function mapPlanTag(tag?: string | null): string {
  const value = (tag ?? "").toLowerCase();
  if (!value) return "Unknown";
  if (value === "gold" || value === "platinum") return "Gold";
  if (value === "silver" || value === "premium") return "Premium";
  if (value === "bronze" || value === "trial") return "Bronze";
  return "Unknown";
}

export async function buildAdminOrganizationsList(input: {
  roles: readonly string[];
  billingByOrganization?: readonly OrgBillingRow[];
}): Promise<AdminOrganizationRow[]> {
  void input.roles;
  const billingByOrg = new Map(
    (input.billingByOrganization ?? []).map((row) => [row.organizationId, row])
  );

  const [orgs, teamRows, plans, activeSubs] = await Promise.all([
    Organizations.find({}).lean(),
    Teams.find({ invitationStatus: "accepted" }).select("Organization userId").lean(),
    PlansModel.find({}).lean(),
    Subscriptions.find({ status: "active" }).lean(),
  ]);

  if (!orgs.length) return [];

  const exclusions = await loadAdminDemoExclusions();
  const liveOrgs = orgs.filter(
    (org) =>
      !isDemoOrgName(org.companyName) &&
      !isDemoOrganizationId(String(org._id), exclusions) &&
      !isDemoCustomerUserId(String(org.owner), exclusions)
  );
  if (!liveOrgs.length) return [];

  const planById = new Map(plans.map((plan) => [plan.plan_id, plan]));
  const subByUserId = new Map(activeSubs.map((sub) => [String(sub.userId), sub]));
  const membersByOrg = new Map<string, number>();
  for (const team of teamRows) {
    const orgId = String(team.Organization);
    membersByOrg.set(orgId, (membersByOrg.get(orgId) ?? 0) + 1);
  }

  const ownerIds = liveOrgs.map((org) => org.owner).filter(Boolean);
  const orgIds = liveOrgs.map((org) => org._id);

  const [owners, requirements, projects] = await Promise.all([
    Users.find({ _id: { $in: ownerIds } })
      .select("_id name email relationship_manager createdAt")
      .lean(),
    Requirement.find({ userId: { $in: ownerIds } }).select("userId status title").lean(),
    Projects.find({
      $or: [{ userId: { $in: ownerIds } }, { orgId: { $in: orgIds } }],
    })
      .select("userId orgId status")
      .lean(),
  ]);

  const staffIds = owners
    .map((owner) => owner.relationship_manager)
    .filter((value): value is mongoose.Types.ObjectId => Boolean(value));
  const staffRows = staffIds.length
    ? await Staff.find({ _id: { $in: staffIds } }).select("userId").lean()
    : [];
  const managerUserIds = staffRows
    .map((row) => row.userId)
    .filter((value): value is mongoose.Types.ObjectId => Boolean(value));
  const managerUsers = managerUserIds.length
    ? await Users.find({ _id: { $in: managerUserIds } }).select("name").lean()
    : [];
  const managerNameByUserId = new Map(
    managerUsers.map((user) => [String(user._id), user.name ?? "Unassigned"])
  );
  const managerNameByStaffId = new Map(
    staffRows.map((row) => [
      String(row._id),
      managerNameByUserId.get(String(row.userId)) ?? "Unassigned",
    ])
  );
  const managerNameByOwnerId = new Map(
    owners.map((owner) => [
      String(owner._id),
      owner.relationship_manager
        ? managerNameByStaffId.get(String(owner.relationship_manager)) ?? "Unassigned"
        : "Unassigned",
    ])
  );

  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));

  const activeReqByOwner = new Map<string, number>();
  for (const req of requirements) {
    if (!isActiveStatus(req.status)) continue;
    if (/^\s*live brief ·/i.test(String(req.title ?? ""))) continue;
    const userId = String(req.userId);
    activeReqByOwner.set(userId, (activeReqByOwner.get(userId) ?? 0) + 1);
  }

  const activeProjByOwner = new Map<string, number>();
  const activeProjByOrg = new Map<string, number>();
  for (const project of projects) {
    if (!isActiveStatus(project.status)) continue;
    if (project.userId) {
      const userId = String(project.userId);
      activeProjByOwner.set(userId, (activeProjByOwner.get(userId) ?? 0) + 1);
    }
    if (project.orgId) {
      const orgId = String(project.orgId);
      activeProjByOrg.set(orgId, (activeProjByOrg.get(orgId) ?? 0) + 1);
    }
  }

  const rows: AdminOrganizationRow[] = liveOrgs.map((org) => {
    const organizationId = String(org._id);
    const customerUserId = String(org.owner);
    const owner = ownerById.get(customerUserId);
    const billingRow =
      billingByOrg.get(organizationId) ??
      [...billingByOrg.values()].find((row) => row.customerUserId === customerUserId);

    const activeReq = Math.max(
      activeReqByOwner.get(customerUserId) ?? 0,
      activeProjByOwner.get(customerUserId) ?? 0,
      activeProjByOrg.get(organizationId) ?? 0
    );

    const sub = subByUserId.get(customerUserId);
    const plan = sub ? planById.get(sub.planId) : null;
    const membership = mapPlanTag(plan?.tag);
    const managerName = managerNameByOwnerId.get(customerUserId) ?? "Unassigned";
    const ownerCreatedAt = (owner as { createdAt?: Date | string } | undefined)?.createdAt;

    return {
      organizationId,
      customerUserId,
      companyName: org.companyName ?? owner?.name ?? "Unknown org",
      industry: org.industry ?? "—",
      contactPerson: org.contactPerson || owner?.name || "—",
      contactEmail: org.contactEmail || owner?.email || "—",
      ownerName: owner?.name ?? "—",
      managerName,
      memberSince: ownerCreatedAt ? new Date(ownerCreatedAt).toISOString() : "",
      activeReq,
      membership,
      revenueMtd: billingRow?.revenue ?? 0,
      aiCostMtd: billingRow?.aiCost ?? 0,
      humanCostMtd: billingRow?.humanCost ?? 0,
      memberCount: membersByOrg.get(organizationId) ?? 1,
    };
  });

  return rows.sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export type AdminOrganizationRequestRow = {
  requestId: string;
  rawProjectId: string;
  brand: string;
  service: string;
  status: string;
  priority: string;
  assignedTo: string;
  createdBy: string;
  dateCreated: string;
  completed: string;
  aiRoute: string;
  aiTool: string;
};

export type AdminOrganizationDetail = AdminOrganizationRow & {
  companyType: string;
  website: string;
  contactMobile: string;
  companyAddress: string;
  companyHeadquarters: string;
  gst: string;
  orgStatus: string;
  brandCount: number;
  fileCount: number;
  businessAge: string;
  targetAudience: string;
  about: string;
  requests: AdminOrganizationRequestRow[];
};

function normalizeLookupId(value: string): string {
  return value.trim().toLowerCase().replace(/^org-|^usr-/, "");
}

function matchesOrganizationLookup(
  lookupId: string,
  organizationId: string,
  customerUserId: string
): boolean {
  const needle = normalizeLookupId(lookupId);
  if (!needle) return false;
  if (organizationId.toLowerCase() === lookupId.trim().toLowerCase()) return true;
  if (customerUserId.toLowerCase() === lookupId.trim().toLowerCase()) return true;
  if (organizationId.toLowerCase().endsWith(needle)) return true;
  if (customerUserId.toLowerCase().endsWith(needle)) return true;
  return false;
}

function isLiveOrganizationRow(
  org: { _id: unknown; owner?: unknown; companyName?: string | null },
  exclusions: Awaited<ReturnType<typeof loadAdminDemoExclusions>>
): boolean {
  const organizationId = String(org._id);
  const customerUserId = String(org.owner ?? "");
  if (isDemoOrgName(org.companyName)) return false;
  if (isDemoOrganizationId(organizationId, exclusions)) return false;
  if (customerUserId && isDemoCustomerUserId(customerUserId, exclusions)) return false;
  return true;
}

async function resolveOrganizationByLookup(
  lookupId: string,
  exclusions: Awaited<ReturnType<typeof loadAdminDemoExclusions>>
) {
  const needle = normalizeLookupId(lookupId);
  const raw = lookupId.trim();
  if (!needle) return null;

  const accept = (org: { _id: unknown; owner?: unknown; companyName?: string | null }) => {
    if (!isLiveOrganizationRow(org, exclusions)) return false;
    return matchesOrganizationLookup(
      lookupId,
      String(org._id),
      String(org.owner ?? "")
    );
  };

  for (const candidate of [raw, needle]) {
    if (/^[a-f0-9]{24}$/i.test(candidate)) {
      const org = await Organizations.findById(candidate).lean();
      if (org && accept(org)) return org;
    }
  }

  const ownerCandidates = await Users.find({})
    .select("_id")
    .lean();
  const owner = ownerCandidates.find((row) => {
    const userId = String(row._id);
    return (
      userId.toLowerCase() === raw.toLowerCase() ||
      userId.toLowerCase().endsWith(needle)
    );
  });
  if (owner) {
    const org = await Organizations.findOne({ owner: owner._id }).lean();
    if (org && accept(org)) return org;
  }

  const orgIdRows = await Organizations.find({}).select("_id owner companyName").lean();
  const matched = orgIdRows.find((row) => accept(row));
  if (!matched) return null;
  return Organizations.findById(matched._id).lean();
}

function formatBusinessAge(value?: Date | string | null): string {
  if (!value) return "—";
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "—";
  const months = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000))
  );
  if (months < 1) return "Less than 1 month";
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? "1 year" : `${years} years`;
  return `${years}y ${rem}m`;
}

function mapProjectStatusLabel(status?: string | null): string {
  const value = String(status ?? "").toLowerCase();
  if (value.includes("approved") || value.includes("delivered") || value.includes("closed")) {
    return "Completed";
  }
  if (value.includes("review") || value.includes("revision") || value.includes("hold")) {
    return "Pending Review";
  }
  if (value.includes("escalat") || value.includes("block")) return "Escalated";
  return "In Progress";
}

function mapProjectRoute(project: {
  origin?: string | null;
  executionId?: string | null;
  creationMode?: string | null;
}): string {
  const origin = String(project.origin ?? "").toLowerCase();
  const mode = String(project.creationMode ?? "").toLowerCase();
  if (mode.includes("hybrid")) return "Hybrid";
  if (origin === "ai_creative" || String(project.executionId ?? "").trim()) {
    return "AI";
  }
  if (mode === "human") return "Human Only";
  return "Human Only";
}

function formatDisplayDate(value?: Date | string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function readOrgTextField(org: Record<string, unknown>, key: string): string {
  const value = org[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function resolveOrganizationTargetAudience(org: Record<string, unknown>): string {
  return readOrgTextField(org, "targetAudience") || "—";
}

function resolveOrganizationAbout(
  org: Record<string, unknown>,
  input: {
    companyName: string;
    industry?: string | null;
    website?: string | null;
    brandNames: string[];
  }
): string {
  const about = readOrgTextField(org, "about");
  if (about) return about;
  return buildAboutText(input);
}

function resolveOrganizationBusinessAge(
  org: Record<string, unknown>,
  memberSinceSource?: Date | string | null
): string {
  const businessAge = readOrgTextField(org, "businessAge");
  if (businessAge) return businessAge;
  return formatBusinessAge(memberSinceSource);
}

function buildAboutText(input: {
  companyName: string;
  industry?: string | null;
  website?: string | null;
  brandNames: string[];
}): string {
  const parts: string[] = [];
  if (input.industry) {
    parts.push(`${input.companyName} operates in ${input.industry}.`);
  } else {
    parts.push(`${input.companyName} is a registered Unagency client organization.`);
  }
  if (input.website) parts.push(`Website: ${input.website}.`);
  if (input.brandNames.length) {
    parts.push(`Active brands include ${input.brandNames.slice(0, 5).join(", ")}.`);
  }
  return parts.join(" ");
}

export async function buildAdminOrganizationDetail(input: {
  lookupId: string;
  billingByOrganization?: readonly OrgBillingRow[];
}): Promise<AdminOrganizationDetail | null> {
  const billingByOrg = new Map(
    (input.billingByOrganization ?? []).map((row) => [row.organizationId, row])
  );
  const exclusions = await loadAdminDemoExclusions();
  const org = await resolveOrganizationByLookup(input.lookupId, exclusions);
  if (!org) return null;

  const organizationId = String(org._id);
  const customerUserId = String(org.owner);
  const billingRow =
    billingByOrg.get(organizationId) ??
    [...billingByOrg.values()].find((row) => row.customerUserId === customerUserId);

  const [owner, brands, fileCount, projects, teamRows, plans, activeSubs] =
    await Promise.all([
      Users.findById(customerUserId)
        .select("_id name email relationship_manager createdAt")
        .lean(),
      Brands.find({ organizationId: org._id, status: { $ne: "archived" } })
        .select("name")
        .lean(),
      MediaFile.countDocuments({ organizationId: org._id, status: { $ne: "deleted" } }),
      Projects.find({
        $or: [{ userId: customerUserId }, { orgId: org._id }],
      })
        .select(
          "_id title status origin executionId sourceRouteId creationMode createdAt updatedAt category orgId"
        )
        .sort({ createdAt: -1 })
        .lean(),
      Teams.find({ Organization: org._id, invitationStatus: "accepted" })
        .select("userId")
        .lean(),
      PlansModel.find({}).lean(),
      Subscriptions.find({ status: "active", userId: customerUserId }).lean(),
    ]);

  const staffRows = owner?.relationship_manager
    ? await Staff.findById(owner.relationship_manager).select("userId").lean()
    : null;

  const managerUser = staffRows?.userId
    ? await Users.findById(staffRows.userId).select("name").lean()
    : null;

  const projectIds = projects.map((project) => project._id);
  const categoryIds = [
    ...new Set(
      projects
        .map((project) => project.category)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
    ),
  ];
  const [tasks, categoryRows] = await Promise.all([
    projectIds.length
      ? Tasks.find({ project: { $in: projectIds } })
          .select("project assignedTo status updatedAt")
          .lean()
      : Promise.resolve([]),
    categoryIds.length
      ? Categories.find({ _id: { $in: categoryIds } }).select("title").lean()
      : Promise.resolve([]),
  ]);

  const categoryTitleById = new Map(
    categoryRows.map((category) => [String(category._id), category.title ?? ""])
  );

  const staffIds = [
    ...new Set(
      tasks
        .map((task) => task.assignedTo)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
    ),
  ];
  const staffRowsForTasks = staffIds.length
    ? await Staff.find({ _id: { $in: staffIds } }).select("userId").lean()
    : [];
  const assigneeUserIds = staffRowsForTasks
    .map((row) => row.userId)
    .filter((value): value is mongoose.Types.ObjectId => Boolean(value));
  const assigneeUsers = assigneeUserIds.length
    ? await Users.find({ _id: { $in: assigneeUserIds } }).select("name").lean()
    : [];
  const userNameById = new Map(
    assigneeUsers.map((user) => [String(user._id), String(user.name ?? "")])
  );
  const staffUserIdByStaffId = new Map(
    staffRowsForTasks.map((row) => [String(row._id), String(row.userId ?? "")])
  );

  const assigneeByProject = new Map<string, string>();
  for (const task of tasks) {
    const projectId = String(task.project);
    const staffId = task.assignedTo ? String(task.assignedTo) : "";
    const userId = staffUserIdByStaffId.get(staffId) ?? "";
    const name = userNameById.get(userId) ?? "";
    if (name) assigneeByProject.set(projectId, name);
  }

  const uniqueBrandNames = [...new Set(brands.map((brand) => brand.name).filter(Boolean))];

  const planById = new Map(plans.map((plan) => [plan.plan_id, plan]));
  const sub = activeSubs[0];
  const plan = sub ? planById.get(sub.planId) : null;

  const activeReq = projects.filter((project) => isActiveStatus(project.status)).length;
  const memberSinceSource =
    (org as { createdAt?: Date | string }).createdAt ?? owner?.createdAt ?? null;

  const row: AdminOrganizationRow = {
    organizationId,
    customerUserId,
    companyName: org.companyName ?? owner?.name ?? "Unknown org",
    industry: org.industry ?? "—",
    contactPerson: org.contactPerson || owner?.name || "—",
    contactEmail: org.contactEmail || owner?.email || "—",
    ownerName: owner?.name ?? "—",
    managerName: managerUser?.name ?? "Unassigned",
    memberSince: memberSinceSource ? new Date(memberSinceSource).toISOString() : "",
    activeReq,
    membership: mapPlanTag(plan?.tag),
    revenueMtd: billingRow?.revenue ?? 0,
    aiCostMtd: billingRow?.aiCost ?? 0,
    humanCostMtd: billingRow?.humanCost ?? 0,
    memberCount: Math.max(teamRows.length, 1),
  };

  const billableProjects = projects.filter((project) => !isDemoTitle(project.title));
  const aiTools = await resolveProjectAiProvidersBatch(billableProjects);

  const requests: AdminOrganizationRequestRow[] = billableProjects.map((project, index) => {
    const aiRoute = mapProjectRoute(project);
    const categoryTitle = project.category
      ? categoryTitleById.get(String(project.category)) ?? ""
      : "";
    const completedAt =
      mapProjectStatusLabel(project.status) === "Completed"
        ? formatDisplayDate(project.updatedAt ?? project.createdAt)
        : "—";
    return {
      requestId: String(project._id),
      rawProjectId: String(project._id),
      brand: project.title || "Untitled project",
      service: categoryTitle || "Creative",
      status: mapProjectStatusLabel(project.status),
      priority: "Normal",
      assignedTo: assigneeByProject.get(String(project._id)) ?? "Unassigned",
      createdBy: "Client",
      dateCreated: formatDisplayDate(project.createdAt),
      completed: completedAt,
      aiRoute,
      aiTool: aiTools[index] ?? "—",
    };
  });

  return {
    ...row,
    companyType: org.companyType || "—",
    website: org.website || "—",
    contactMobile: org.contactMobile || "—",
    companyAddress: org.companyAddress || "—",
    companyHeadquarters: org.companyHeadquaters || "—",
    gst: org.GST || "—",
    orgStatus: org.status || "active",
    brandCount: uniqueBrandNames.length,
    fileCount,
    businessAge: resolveOrganizationBusinessAge(
      org as Record<string, unknown>,
      memberSinceSource
    ),
    targetAudience: resolveOrganizationTargetAudience(org as Record<string, unknown>),
    about: resolveOrganizationAbout(org as Record<string, unknown>, {
      companyName: row.companyName,
      industry: row.industry,
      website: org.website,
      brandNames: uniqueBrandNames,
    }),
    requests,
  };
}
